mod commands;
mod workspace;
mod llm;
mod state;
mod agents;

use commands::workspace::{list_workspace, read_workspace_file, write_workspace_file};
use commands::llm::llm_stream_chat;
use commands::orchestrator::execute_agent_workflow;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            list_workspace,
            read_workspace_file,
            write_workspace_file,
            llm_stream_chat,
            execute_agent_workflow,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
