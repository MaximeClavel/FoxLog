---
description: "Guidelines for writing JavaScript code — adapted from awesome-copilot for Chrome extension context"
applyTo: '**/*.js'
---

# JavaScript Code Generation Guidelines

## Coding standards

- Use modern JavaScript features (ES2022+) where supported by Chrome extensions (Manifest V3)
- Avoid external dependencies where possible — prefer native browser APIs
- Ask the user if you require any additional dependencies before adding them
- Always use async/await for asynchronous code
- Keep the code simple and maintainable
- Use descriptive variable and function names
- Do not add comments unless absolutely necessary — the code should be self-explanatory
- Prefer `undefined` over `null` for optional values when possible
- Use `'use strict'` in all IIFE modules

## Testing

- Write tests for all new features and bug fixes
- Ensure tests cover edge cases and error handling
- NEVER change the original code to make it easier to test — instead, write tests that cover the original code as it is

## Documentation

- When adding new features or making significant changes, update the README.md file where necessary
- Use JSDoc with `@param` and `@returns` for all public methods

## User interactions

- Ask questions if you are unsure about the implementation details, design choices, or need clarification on the requirements
- Always answer in the same language as the question, but use English for generated content like code, comments, or docs
