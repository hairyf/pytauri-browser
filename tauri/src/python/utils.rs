use std::{error::Error, path::PathBuf};

use pytauri::standalone::{dunce::simplified, PythonInterpreterEnv};
use tauri::utils::platform::resource_dir;
use crate::python::binding::context;

pub fn get_venv_path() -> Result<PathBuf, Box<dyn Error>> {
    // CARGO_MANIFEST_DIR 是 tauri/，向上一级才是仓库根目录
    let venv_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".venv");
    if venv_path.is_dir() {
        // 使用 canonicalize 确保路径规范化（处理符号链接等）
        Ok(venv_path.canonicalize()?)
    } else {
        Err(format!(
            "未找到虚拟环境: {:?}\n请确保在项目根目录创建了 .venv",
            venv_path
        )
        .into())
    }
}

pub fn get_env() -> Result<PythonInterpreterEnv<'static>, Box<dyn Error>> {
    let env = if cfg!(dev) {
        // 开发模式：直接使用指定的 .venv 路径
        PythonInterpreterEnv::Venv(get_venv_path()?.into())
    } else {
        // 生产模式：使用资源目录下的 Python 环境
        let context = context();
        let res_dir = resource_dir(context.package_info(), &tauri::Env::default())
            .map_err(|e| format!("无法获取资源目录: {e}"))?;
        // 移除 UNC 前缀以确保 Python 生态兼容性
        let simplified_res_dir = simplified(&res_dir).to_owned();
        PythonInterpreterEnv::Standalone(simplified_res_dir.into())
    };
    
    Ok(env)
}
