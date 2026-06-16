use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentTask {
    pub user_original_query: String,
    pub execution_plan: Vec<ExecutionStep>,
    pub validation: TaskValidation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionStep {
    pub assigned_agent: String,
    pub action_description: String,
    pub file_targets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskValidation {
    pub total_steps: usize,
    pub completed_steps: usize,
    pub failed_steps: Vec<String>,
    pub success: bool,
}

impl CurrentTask {
    pub fn new(query: &str) -> Self {
        Self {
            user_original_query: query.to_string(),
            execution_plan: Vec::new(),
            validation: TaskValidation {
                total_steps: 0,
                completed_steps: 0,
                failed_steps: Vec::new(),
                success: false,
            },
        }
    }

    pub fn to_json_pretty(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }
}

impl TaskValidation {
    pub fn mark_step_failed(&mut self, step_description: &str) {
        self.failed_steps.push(step_description.to_string());
    }

    pub fn mark_step_complete(&mut self) {
        self.completed_steps += 1;
    }

    pub fn finalize(&mut self) {
        self.success = self.failed_steps.is_empty()
            && self.completed_steps == self.total_steps;
    }
}
