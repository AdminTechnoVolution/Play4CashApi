---
description: How to create a new skill for the Antigravity coding assistant in this project
---

# Create a New Skill

This skill documents the process of creating "Skills" for the Antigravity assistant. Skills are collections of instructions, patterns, and best practices that help the assistant perform specialized tasks consistently across the codebase.

---

## 📁 Skill structure

Every skill must live in a dedicated folder under `.agents/skills/`:

```
.agents/skills/<skill-name>/
├── SKILL.md            ← [REQUIRED] Main instruction file
├── scripts/            ← [Optional] Helper scripts or utilities
├── examples/           ← [Optional] Reference implementations
└── resources/          ← [Optional] Templates or static assets
```

---

## 📝 The SKILL.md File

This is the most important file. It MUST follow this specific format:

### 1. YAML Frontmatter
The file must start with a YAML block containing a short `description`.

```markdown
---
description: Brief one-line summary of what the skill does
---
```

### 2. Main Content
The rest of the file should use Markdown to provide:
- **Title**: A clear `#` heading.
- **Context**: Why this skill exists and what it solves.
- **File Structure**: A tree view of expected files/directories.
- **Implementation Steps**: Numbered steps with code blocks showing exact patterns.
- **Conventions**: Rules that must never be broken (e.g., error handling, naming).
- **Checklist**: A list of items to verify before finishing the task.

---

## 💡 Best Practices for Writing Skills

1. **Be Extremely Specific**: Don't just say "Add a route". Show the exact decorators, type safety, and error handling pattern.
2. **Use Absolute Paths**: When referencing files in instructions, use the full path from the project root (e.g., `src/common/i18n/locales/en.json`).
3. **Template Code Blocks**: Use `<Name>` or `[placeholder]` in code blocks so the assistant knows what to replace.
4. **Include Error Patterns**: Document how to handle failures, not just the "happy path".
5. **Standardized Responses**: Remind the assistant of the project's response shape (`{ success, messages, data }`).

---

## 🚀 Step-by-Step: Creating a Skill

### Step 1: Initialize Folder
Create the directory in `.agents/skills/` using a kebab-case name.
```bash
mkdir -p .agents/skills/my-new-task
```

### Step 2: Write SKILL.md
Create the `SKILL.md` file with the YAML header and detailed markdown. Focus on patterns that are "deceptively simple" but have strict project rules.

### Step 3: Add Assets
If the skill requires a complex template, save it in `resources/template.ts` instead of pasting 500 lines in the markdown.

### Step 4: Verification
Verify that the skill is searchable by the assistant. The assistant will see the skill name and description in its tool list.

---

## 📋 Skill Checklist

- [ ] Folder created in `.agents/skills/` with kebab-case name.
- [ ] `SKILL.md` exists and contains valid YAML frontmatter.
- [ ] Description is clear and helps the assistant decide when to use it.
- [ ] Absolute paths are used for all file references.
- [ ] Code examples follow the project's specific conventions (NestJS, Mongoose, I18n).
- [ ] A local checklist is included at the end of `SKILL.md`.
