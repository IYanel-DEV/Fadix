use crate::llm::{ChatMessage, LlmConfig, LlmRequest, Provider};
use crate::state::CurrentTask;

const ARCHITECT_SYSTEM_PROMPT: &str = r#"You are the Architect agent in a multi-agent code assistant.

Your task: analyze the user's request and the project file tree, then produce a strict execution blueprint.

OUTPUT FORMAT — return ONLY valid JSON matching this schema:
{
  "userOriginalQuery": "<original user request>",
  "executionPlan": [
    {
      "assignedAgent": "coder" | "backend" | "ui",
      "actionDescription": "<specific action to perform>",
      "fileTargets": ["<relative/path/to/file>", ...]
    }
  ],
  "validation": {
    "totalSteps": <number>,
    "completedSteps": 0,
    "failedSteps": [],
    "success": false
  }
}

RULES:
- assignedAgent must be exactly one of: "coder", "backend", "ui"
- fileTargets must use relative paths from the project root
- executionPlan must be ordered by dependency (backend before coder if state logic needed, ui last)
- Return ONLY the JSON object, no markdown fences, no explanation"#;

pub fn build_architect_prompt(
    user_query: &str,
    file_tree_json: &str,
) -> Vec<ChatMessage> {
    vec![
        ChatMessage {
            role: "system".to_string(),
            content: ARCHITECT_SYSTEM_PROMPT.to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: format!(
                "USER REQUEST:\n{}\n\nPROJECT FILE TREE:\n{}",
                user_query, file_tree_json
            ),
        },
    ]
}

pub fn parse_architect_response(response: &str) -> Result<CurrentTask, String> {
    let trimmed = response.trim();

    let json_str = if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            &trimmed[start..=end]
        } else {
            trimmed
        }
    } else {
        trimmed
    };

    let task: CurrentTask =
        serde_json::from_str(json_str).map_err(|e| format!("Failed to parse architect JSON: {}", e))?;

    if task.execution_plan.is_empty() {
        return Err("Architect returned empty execution plan".to_string());
    }

    Ok(task)
}

pub fn build_specialist_context(
    task: &CurrentTask,
    step_index: usize,
    file_contents: &[String],
) -> Vec<ChatMessage> {
    let step = &task.execution_plan[step_index];
    let files_section = file_contents
        .iter()
        .enumerate()
        .map(|(i, c)| format!("--- FILE {} ---\n{}", i + 1, c))
        .collect::<Vec<_>>()
        .join("\n\n");

    vec![
        ChatMessage {
            role: "system".to_string(),
            content: format!(
                "You are the {} specialist agent.\n\
                 Your task: {}\n\
                 Target files are provided below.\n\
                 Return ONLY the modified file content with clear markers:\n\
                 FILE:<path>\n<new content>\nEND_FILE",
                step.assigned_agent, step.action_description
            ),
        },
        ChatMessage {
            role: "user".to_string(),
            content: format!(
                "ORIGINAL USER QUERY:\n{}\n\nFILES TO MODIFY:\n{}",
                task.user_original_query, files_section
            ),
        },
    ]
}
