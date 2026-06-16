use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub enum OrchestratorPhase {
    Idle,
    Planning,
    Coding,
    Verifying,
    Complete,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub enum AgentStatus {
    Idle,
    Working,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub active_provider: String,
    pub target_directory: String,
    pub current_phase: OrchestratorPhase,
    pub agent_statuses: HashMap<String, AgentStatus>,
    pub event_log: Vec<LogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp: String,
    pub agent: String,
    pub phase: String,
    pub message: String,
}

impl Default for WorkspaceState {
    fn default() -> Self {
        let mut agent_statuses = HashMap::new();
        agent_statuses.insert("architect".to_string(), AgentStatus::Idle);
        agent_statuses.insert("coder".to_string(), AgentStatus::Idle);
        agent_statuses.insert("backend".to_string(), AgentStatus::Idle);
        agent_statuses.insert("ui".to_string(), AgentStatus::Idle);

        Self {
            active_provider: "nvidia".to_string(),
            target_directory: String::new(),
            current_phase: OrchestratorPhase::Idle,
            agent_statuses,
            event_log: Vec::new(),
        }
    }
}

impl WorkspaceState {
    pub fn now_timestamp() -> String {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .to_string()
    }

    pub fn push_log(&mut self, agent: &str, phase: &str, message: &str) {
        self.event_log.push(LogEntry {
            timestamp: Self::now_timestamp(),
            agent: agent.to_string(),
            phase: phase.to_string(),
            message: message.to_string(),
        });
    }

    pub fn set_phase(&mut self, phase: OrchestratorPhase) {
        self.current_phase = phase;
    }

    pub fn set_agent_status(&mut self, agent: &str, status: AgentStatus) {
        self.agent_statuses
            .insert(agent.to_string(), status);
    }

    pub fn to_json_pretty(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }
}
