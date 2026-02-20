# Contributing to Orbit

## Development Workflow

### Before Starting Work

1. Pull latest changes: `git pull origin main`
2. Install/update dependencies: `npm install`
3. Ensure database is up to date: `npm run db:push`

### Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Test locally: `npm run dev`
4. Run linting: `npm run lint`
5. Check for security issues: `npm audit`

### Before Committing

Run the pre-commit checklist:

```bash
npm run precommit
```

This runs:
- Linting (`npm run lint`)
- Security audit (`npm audit`)

Also manually verify:
- [ ] No secrets in code
- [ ] `.env` files not committed
- [ ] CHANGELOG.md updated (if user-facing changes)
- [ ] Database migrations created (if schema changed)

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject

Examples:
feat(import): add product selection to import flow
fix(scoring): correct combined score calculation
docs(readme): update setup instructions
```

### Pull Request Process

1. Push your branch: `git push origin feature/your-feature-name`
2. Create PR on GitHub
3. Ensure CI passes (if configured)
4. Get code review approval
5. Merge to main

### Database Changes

**Development:**
```bash
# Edit prisma/schema.prisma
npm run db:push
```

**Production (use migrations):**
```bash
npm run db:migrate -- --name descriptive_name
npm run db:migrate:deploy  # In production
```

### Adding New Features

1. Update CHANGELOG.md in `[Unreleased]` section
2. Follow existing code patterns
3. Add error handling
4. Test edge cases
5. Update documentation if needed

### Code Style

- Follow existing TypeScript patterns
- Use Tailwind classes (no custom CSS unless necessary)
- Keep components focused and small
- Use meaningful variable names
- Add comments for complex logic

## Questions?

Ask the team lead or check existing code for patterns.
