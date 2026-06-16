use crate::llm::{ChatMessage, LlmConfig, LlmRequest};
use crate::state::{CurrentTask, WorkspaceState};

pub fn build_ui_prompt(
    task: &CurrentTask,
    step_index: usize,
    file_contents: &[String],
    file_paths: &[String],
) -> Vec<ChatMessage> {
    let step = &task.execution_plan[step_index];
    let files_section = file_paths
        .iter()
        .zip(file_contents.iter())
        .map(|(p, c)| format!("--- FILE: {} ---\n{}", p, c))
        .collect::<Vec<_>>()
        .join("\n\n");

    vec![
        ChatMessage {
            role: "system".to_string(),
            content: "You are the Design/UI Specialist agent.\n\
                       Review and validate the provided frontend code for:\n\
                       - Tailwind CSS class correctness\n\
                       - shadcn/ui component integration\n\
                       - Layout structure and responsiveness\n\
                       - Visual consistency and styling tokens\n\
                       - Component prop correctness\n\n\
                       If changes are needed, output modified files in this format:\n\
                       FILE:<relative_path>\n<full file content>\nEND_FILE\n\n\
                       If the UI is correct as-is, respond with: APPROVED\n\n\
                       Rules:\n\
                       - Return complete file contents, not patches\n\
                       - No markdown fences, no explanations, only FILE blocks or APPROVED"
                .to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: format!(
                "TASK: {}\n\nUSER REQUEST:\n{}\n\nFILES TO REVIEW:\n{}",
                step.action_description, task.user_original_query, files_section
            ),
        },
    ]
}

pub fn parse_ui_output(output: &str) -> UiValidationResult {
    let trimmed = output.trim();
    if trimmed.eq_ignore_ascii_case("APPROVED") {
        return UiValidationResult::Approved;
    }

    let files = parse_file_blocks(output);
    if files.is_empty() {
        UiValidationResult::Approved
    } else {
        UiValidationResult::NeedsChanges(files)
    }
}

pub enum UiValidationResult {
    Approved,
    NeedsChanges(Vec<(String, String)>),
}

fn parse_file_blocks(output: &str) -> Vec<(String, String)> {
    let mut results = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_content = String::new();

    for line in output.lines() {
        if let Some(path) = line.strip_prefix("FILE:") {
            if let Some(prev_path) = current_path.take() {
                results.push((prev_path, current_content.trim_end().to_string()));
                current_content.clear();
            }
            current_path = Some(path.trim().to_string());
        } else if line.trim() == "END_FILE" {
            if let Some(path) = current_path.take() {
                results.push((path, current_content.trim_end().to_string()));
                current_content.clear();
            }
        } else if current_path.is_some() {
            current_content.push_str(line);
            current_content.push('\n');
        }
    }

    if let Some(path) = current_path {
        results.push((path, current_content.trim_end().to_string()));
    }

    results
}

pub async fn apply_ui_changes(
    root_dir: &str,
    files: &[(String, String)],
    state: &mut WorkspaceState,
) -> Result<(), String> {
    for (relative_path, content) in files {
        let full_path = format!("{}/{}", root_dir.trim_end_matches('/'), relative_path);
        crate::workspace::atomic_writer::atomic_write(&full_path, content, true)
            .await
            .map_err(|e| {
                state.push_log(
                    "ui",
                    "Failed",
                    &format!("Failed to write {}: {}", relative_path, e),
                );
                format!("UI write failed for {}: {}", relative_path, e)
            })?;
        state.push_log(
            "ui",
            "Verifying",
            &format!("Wrote corrected: {}", relative_path),
        );
    }
    Ok(())
}
