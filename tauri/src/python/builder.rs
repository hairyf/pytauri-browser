use std::error::Error;

use pyo3::{prelude::*, wrap_pymodule};
use pytauri::standalone::{PythonInterpreterBuilder, PythonScript};

use crate::python::binding::binding_module;
use crate::python::utils::get_env;

pub fn builder() -> Result<
    PythonInterpreterBuilder<'static, impl for<'py> FnOnce(Python<'py>) -> Py<PyModule>>,
    Box<dyn Error>,
> {
    let env = get_env()?;
    let script = PythonScript::Module("tauri_app".into());
    let builder =
        PythonInterpreterBuilder::new(env, script, |py| wrap_pymodule!(binding_module)(py));
    Ok(builder)
}
