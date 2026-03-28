"""The tauri-app."""

from anyio.from_thread import start_blocking_portal

from pytauri import (
    Commands,
    builder_factory,
    context_factory,
)

from tauri_app.browser import register_browser_commands


def main() -> int:
    """Run the tauri-app."""
    commands = Commands()
    register_browser_commands(commands)

    with start_blocking_portal() as portal:
        invoke_handler = commands.generate_handler(portal)
        app = builder_factory().build(
            context=context_factory(),
            invoke_handler=invoke_handler,
        )
        exit_code = app.run_return()
    return exit_code
