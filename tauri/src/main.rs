// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::convert::Infallible;
use std::error::Error;

use pytauri_lib::python::builder::builder;

fn main() -> Result<Infallible, Box<dyn Error>> {
    let exit_code = builder()?.build()?.run();
    std::process::exit(exit_code);
}
