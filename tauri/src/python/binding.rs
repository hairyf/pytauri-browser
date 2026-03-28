use pyo3::prelude::*;
use crate::builder;

pub fn context() -> tauri::Context {
  tauri::generate_context!()
}

#[pymodule(gil_used = false)]
#[pyo3(name = "binding_module")]
pub mod binding_module {
  use super::*;
  #[pymodule_init]
  fn init(module: &Bound<'_, PyModule>) -> PyResult<()> {
      pytauri::pymodule_export(
          module,
          // i.e., `context_factory` function of python binding
          |_args, _kwargs| Ok(context()),
          // i.e., `builder_factory` function of python binding
          |_args, _kwargs| {
              Ok(builder())
          },
      )
  }
}
