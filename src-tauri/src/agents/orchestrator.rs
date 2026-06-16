use std::path::Path;
use tauri::{AppHandle, Emitter};
use tokio::fs;

use crate::llm::{route_chat, ChatMessage, LlmConfig, LlmRequest, LlmStreamEvent, Provider};
use crate::workspace::file_reader::read_file_content;
use crate::state::{AgentStatus, CurrentTask, OrchestratorPhase, WorkspaceState};

use super::architect::{build_architect_prompt, parse_architect_response};
use super::coder::{apply_coder_changes, build_coder_prompt, parse_coder_output};
use super::backend_specialist::{
    apply_backend_changes, build_backend_prompt, parse_backend_output, BackendValidationResult,
};
use super::ui_specialist::{
    apply_ui_changes, build_ui_prompt, parse_ui_output, UiValidationResult,
};

pub struct Orchestrator {
    config: LlmConfig,
}

impl Orchestrator {
    pub fn new(config: LlmConfig) -> Self {
        Self { config }
    }

    pub async fn run_task_pipeline(
        &self,
        user_query: String,
        app_handle: AppHandle,
        target_dir: String,
    ) -> Result<CurrentTask, String> {
        let mut state = WorkspaceState {
            active_provider: match self.config.provider {
                Provider::Nvidia => "nvidia".to_string(),
                Provider::Local => "local".to_string(),
            },
            target_directory: target_dir.clone(),
            current_phase: OrchestratorPhase::Idle,
            agent_statuses: std::collections::HashMap::new(),
            event_log: Vec::new(),
        };

        state.set_phase(OrchestratorPhase::Idle);
        state.push_log("orchestrator", "Idle", "Pipeline started");
        Self::emit_state(&app_handle, &state);

        let task = self
            .phase_planning(&user_query, &target_dir, &mut state, &app_handle)
            .await?;

        let task = self
            .phase_execution(&task, &target_dir, &mut state, &app_handle)
            .await?;

        let task = self
            .phase_validation(&task, &target_dir, &mut state, &app_handle)
            .await?;

        state.set_phase(OrchestratorPhase::Complete);
        state.push_log("orchestrator", "Complete", "All steps finished successfully");
        Self::emit_state(&app_handle, &state);

        Ok(task)
    }

    fn emit_state(app_handle: &AppHandle, state: &WorkspaceState) {
        let _ = app_handle.emit("agent-phase-change", state);
    }

    fn emit_error(app_handle: &AppHandle, state: &mut WorkspaceState, message: &str) {
        state.set_phase(OrchestratorPhase::Failed);
        state.push_log("orchestrator", "Failed", message);
        Self::emit_state(app_handle, state);
    }

    async fn call_llm(
        &self,
        messages: Vec<ChatMessage>,
        app_handle: &AppHandle,
        agent: &str,
    ) -> Result<String, String> {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<LlmStreamEvent>();

        let request = LlmRequest {
            model: self.config.model.clone(),
            messages,
            temperature: Some(0.0),
            max_tokens: Some(8192),
            stream: true,
        };

        route_chat(self.config.clone(), request, tx);

        let mut full_response = String::new();

        while let Some(event) = rx.recv().await {
            if event.error.is_some() {
                return Err(event.error.unwrap());
            }
            if !event.done {
                full_response.push_str(&event.token);
                let _ = app_handle.emit("llm-token", &event);
            }
            if event.done && event.token.is_empty() {
                break;
            }
        }

        Ok(full_response)
    }

    async fn read_file_safe(
        root_dir: &str,
        relative_path: &str,
    ) -> Option<String> {
        let full_path = format!("{}/{}", root_dir.trim_end_matches('/'), relative_path);
        match read_file_content(&full_path, Some(root_dir)).await {
            Ok(fc) => Some(fc.content),
            Err(_) => None,
        }
    }

    async fn phase_planning(
        &self,
        user_query: &str,
        target_dir: &str,
        state: &mut WorkspaceState,
        app_handle: &AppHandle,
    ) -> Result<CurrentTask, String> {
        state.set_phase(OrchestratorPhase::Planning);
        state.set_agent_status("architect", AgentStatus::Working);
        state.push_log("architect", "Planning", "Generating execution blueprint");
        Self::emit_state(app_handle, state);

        let tree_json = match crate::workspace::scan_directory(target_dir).await {
            Ok(tree) => serde_json::to_string_pretty(&tree).unwrap_or_default(),
            Err(e) => {
                Self::emit_error(app_handle, state, &format!("Failed to scan workspace: {}", e));
                return Err(format!("Workspace scan failed: {}", e));
            }
        };

        let messages = build_architect_prompt(user_query, &tree_json);

        let response = match self.call_llm(messages, app_handle, "architect").await {
            Ok(r) => r,
            Err(e) => {
                Self::emit_error(app_handle, state, &format!("Architect LLM failed: {}", e));
                return Err(e);
            }
        };

        let mut task = match parse_architect_response(&response) {
            Ok(t) => t,
            Err(e) => {
                Self::emit_error(
                    app_handle,
                    state,
                    &format!("Architect output invalid: {}", e),
                );
                return Err(e);
            }
        };

        task.validation.total_steps = task.execution_plan.len();

        let task_json = task.to_json_pretty();
        let task_path = format!("{}/current_task.json", target_dir.trim_end_matches('/'));
        if let Err(e) = fs::write(&task_path, &task_json).await {
            state.push_log(
                "architect",
                "Warning",
                &format!("Could not write current_task.json: {}", e),
            );
        }

        state.set_agent_status("architect", AgentStatus::Idle);
        state.push_log(
            "architect",
            "Planning",
            &format!(
                "Blueprint ready — {} steps",
                task.execution_plan.len()
            ),
        );
        Self::emit_state(app_handle, state);

        Ok(task)
    }

    async fn phase_execution(
        &self,
        task: &CurrentTask,
        target_dir: &str,
        state: &mut WorkspaceState,
        app_handle: &AppHandle,
    ) -> Result<CurrentTask, String> {
        let mut task = task.clone();
        let total = task.execution_plan.len();

        for (i, step) in task.execution_plan.iter().enumerate() {
            let phase = match step.assigned_agent.as_str() {
                "coder" => OrchestratorPhase::Coding,
                "backend" => OrchestratorPhase::Coding,
                "ui" => OrchestratorPhase::Coding,
                _ => OrchestratorPhase::Coding,
            };

            state.set_phase(phase);
            state.set_agent_status(&step.assigned_agent, AgentStatus::Working);
            state.push_log(
                &step.assigned_agent,
                "Executing",
                &format!(
                    "[{}/{}] {}",
                    i + 1,
                    total,
                    step.action_description
                ),
            );
            Self::emit_state(app_handle, state);

            let mut file_contents = Vec::new();
            for file_target in &step.file_targets {
                match Self::read_file_safe(target_dir, file_target).await {
                    Some(content) => file_contents.push(content),
                    None => file_contents.push(String::new()),
                }
            }

            let result = match step.assigned_agent.as_str() {
                "coder" => {
                    let messages = build_coder_prompt(
                        &task,
                        i,
                        &file_contents,
                        &step.file_targets,
                    );
                    let response = self.call_llm(messages, app_handle, "coder").await;
                    match response {
                        Ok(output) => {
                            let files = parse_coder_output(&output);
                            apply_coder_changes(target_dir, &files, state).await
                        }
                        Err(e) => Err(e),
                    }
                }
                "backend" => {
                    let messages = build_backend_prompt(
                        &task,
                        i,
                        &file_contents,
                        &step.file_targets,
                    );
                    let response = self.call_llm(messages, app_handle, "backend").await;
                    match response {
                        Ok(output) => match parse_backend_output(&output) {
                            BackendValidationResult::Validated => {
                                state.push_log(
                                    "backend",
                                    "Verifying",
                                    "Code validated — no changes needed",
                                );
                                Ok(())
                            }
                            BackendValidationResult::NeedsChanges(files) => {
                                apply_backend_changes(target_dir, &files, state).await
                            }
                        },
                        Err(e) => Err(e),
                    }
                }
                "ui" => {
                    let messages =
                        build_ui_prompt(&task, i, &file_contents, &step.file_targets);
                    let response = self.call_llm(messages, app_handle, "ui").await;
                    match response {
                        Ok(output) => match parse_ui_output(&output) {
                            UiValidationResult::Approved => {
                                state.push_log(
                                    "ui",
                                    "Verifying",
                                    "UI approved — no changes needed",
                                );
                                Ok(())
                            }
                            UiValidationResult::NeedsChanges(files) => {
                                apply_ui_changes(target_dir, &files, state).await
                            }
                        },
                        Err(e) => Err(e),
                    }
                }
                unknown => {
                    state.push_log(
                        unknown,
                        "Error",
                        &format!("Unknown agent type: {}", unknown),
                    );
                    Err(format!("Unknown agent type: {}", unknown))
                }
            };

            match result {
                Ok(()) => {
                    task.validation.mark_step_complete();
                    state.set_agent_status(&step.assigned_agent, AgentStatus::Idle);
                    state.push_log(
                        &step.assigned_agent,
                        "Done",
                        &format!("Step {} complete", i + 1),
                    );
                }
                Err(e) => {
                    task.validation.mark_step_failed(&step.action_description);
                    state.set_agent_status(&step.assigned_agent, AgentStatus::Error);
                    state.push_log(
                        &step.assigned_agent,
                        "Error",
                        &format!("Step {} failed: {}", i + 1, e),
                    );

                    if let Some(retry_task) = self
                        .remediation_branch(&task, i, target_dir, state, app_handle)
                        .await
                    {
                        task = retry_task;
                    }
                }
            }

            Self::emit_state(app_handle, state);
        }

        Ok(task)
    }

    async fn remediation_branch(
        &self,
        task: &CurrentTask,
        failed_step: usize,
        target_dir: &str,
        state: &mut WorkspaceState,
        app_handle: &AppHandle,
    ) -> Option<CurrentTask> {
        let step = &task.execution_plan[failed_step];
        state.push_log(
            "orchestrator",
            "Remediation",
            &format!("Retrying step {} once", failed_step + 1),
        );

        state.set_agent_status(&step.assigned_agent, AgentStatus::Working);
        Self::emit_state(app_handle, state);

        let mut file_contents = Vec::new();
        for file_target in &step.file_targets {
            match Self::read_file_safe(target_dir, file_target).await {
                Some(content) => file_contents.push(content),
                None => file_contents.push(String::new()),
            }
        }

        let messages = build_coder_prompt(task, failed_step, &file_contents, &step.file_targets);
        let response = self.call_llm(messages, app_handle, "coder").await.ok()?;
        let files = parse_coder_output(&response);

        if apply_coder_changes(target_dir, &files, state).await.is_ok() {
            let mut task = task.clone();
            task.validation.mark_step_complete();
            task.validation.failed_steps.retain(|f| f != &step.action_description);
            state.set_agent_status(&step.assigned_agent, AgentStatus::Idle);
            state.push_log(
                &step.assigned_agent,
                "Recovered",
                &format!("Step {} recovered after retry", failed_step + 1),
            );
            Some(task)
        } else {
            state.set_agent_status(&step.assigned_agent, AgentStatus::Error);
            None
        }
    }

    async fn phase_validation(
        &self,
        task: &CurrentTask,
        target_dir: &str,
        state: &mut WorkspaceState,
        app_handle: &AppHandle,
    ) -> Result<CurrentTask, String> {
        let mut task = task.clone();

        state.set_phase(OrchestratorPhase::Verifying);
        state.push_log("orchestrator", "Verifying", "Running final validation");
        Self::emit_state(app_handle, state);

        task.validation.finalize();

        if !task.validation.success {
            let msg = format!(
                "Validation failed: {} of {} steps succeeded ({} failed)",
                task.validation.completed_steps,
                task.validation.total_steps,
                task.validation.failed_steps.len()
            );
            Self::emit_error(app_handle, state, &msg);
            return Err(msg);
        }

        state.push_log(
            "orchestrator",
            "Verifying",
            &format!(
                "All {} steps validated successfully",
                task.validation.total_steps
            ),
        );
        Self::emit_state(app_handle, state);

        Ok(task)
    }
}
