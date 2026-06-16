use crate::workspace::{FileNode, FileContent, WriteResult};
use crate::workspace::tree_scanner::scan_directory;
use crate::workspace::file_reader::read_file_content;
use crate::workspace::atomic_writer::atomic_write;

#[tauri::command]
pub async fn list_workspace(root_path: String) -> Result<FileNode, String> {
    scan_directory(&root_path).await
}

#[tauri::command]
pub async fn read_workspace_file(
    file_path: String,
    relative_to: Option<String>,
) -> Result<FileContent, String> {
    read_file_content(&file_path, relative_to.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_workspace_file(
    file_path: String,
    content: String,
    create_backup: Option<bool>,
) -> Result<WriteResult, String> {
    atomic_write(&file_path, &content, create_backup.unwrap_or(true))
        .await
        .map_err(|e| e.to_string())
}
