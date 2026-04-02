---
description: How to create a new collection/module with full CRUD in the Play4CashApi NestJS project
---

# Create a New Collection/Module

This skill documents the exact patterns, file structure, and conventions used in the Play4CashApi NestJS project to create a new Mongoose collection with full CRUD endpoints, Swagger documentation, guards, validation, and multi-language support.

---

## 📁 File Structure

Every module lives in `src/modules/<module-name>/` and has this structure:

```
src/modules/<module-name>/
├── schemas/
│   └── <module-name>.schema.ts      ← Mongoose schema & document type
├── <module-name>.controller.ts      ← REST endpoints + Swagger + DTOs
├── <module-name>.service.ts         ← Business logic + DB queries
└── <module-name>.module.ts          ← NestJS module definition
```

---

## Step 1: Create the Schema

**File:** `src/modules/<module-name>/schemas/<module-name>.schema.ts`

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type <Name>Document = <Name> & Document;

// ── Multi-language field (if needed) ──────────────────────────────────────────
// Reuse this pattern for any field that needs 6-language support.
// Supported languages: es, en, fr, de, it, pt
@Schema({ _id: false })
export class LanguageField {
  @Prop() es: string;
  @Prop() en: string;
  @Prop() fr: string;
  @Prop() de: string;
  @Prop() it: string;
  @Prop() pt: string;
}

@Schema({ versionKey: false, timestamps: true })
export class <Name> {
  // Simple field
  @Prop({ required: true }) fieldName: string;

  // Multi-language field
  @Prop({ type: LanguageField, _id: false, required: true }) title: LanguageField;

  // Boolean with default
  @Prop({ default: true }) active: boolean;

  // Number with constraints
  @Prop({ required: true, min: 0 }) amount: number;

  // ObjectId reference
  // @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'OtherModel' }) refField: Types.ObjectId;

  // Array of primitives
  // @Prop({ type: [String], default: [] }) tags: string[];

  // Nested object
  // @Prop({ type: NestedClass, _id: false }) nested: NestedClass;
}

export const <Name>Schema = SchemaFactory.createForClass(<Name>);
```

### Schema Conventions:
- `versionKey: false` — disables `__v`
- `timestamps: true` — adds `createdAt` and `updatedAt` automatically
- `_id: false` on nested schemas — prevents Mongoose from generating `_id` for subdocuments
- Use `LanguageField` class for any multi-language text field (6 languages: es, en, fr, de, it, pt)

---

## Step 2: Create the Service

**File:** `src/modules/<module-name>/<module-name>.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { <Name>, <Name>Document } from './schemas/<module-name>.schema';
import { BusinessException } from '../../common/exceptions/business.exception';

@Injectable()
export class <Name>Service {
  private readonly logger = new Logger(<Name>Service.name);

  constructor(
    @InjectModel(<Name>.name) private readonly <name>Model: Model<<Name>Document>,
  ) {}

  // ── READ (public, localized) ────────────────────────────────────────────────

  async findAll(lang = 'en'): Promise<any> {
    const supported = ['es', 'en', 'fr', 'de', 'it', 'pt'];
    const l = supported.includes(lang) ? lang : 'en';

    const data = await this.<name>Model.find({ active: true }).lean();

    // Localize multi-language fields
    const localized = data.map(item => ({
      ...item,
      title: item.title?.[l] ?? item.title?.en,
    }));

    return { success: true, messages: [], data: localized };
  }

  async findById(id: string, lang = 'en'): Promise<any> {
    const item = await this.<name>Model.findById(id).lean();
    if (!item) throw new BusinessException('ERROR_NOT_FOUND', 404);

    const l = ['es', 'en', 'fr', 'de', 'it', 'pt'].includes(lang) ? lang : 'en';
    return {
      success: true,
      messages: [],
      data: { ...item, title: item.title?.[l] ?? item.title?.en },
    };
  }

  // ── CREATE (admin) ──────────────────────────────────────────────────────────

  async create(dto: any): Promise<any> {
    const item = await this.<name>Model.create(dto);
    return { success: true, messages: [], data: item };
  }

  // ── UPDATE (admin) ──────────────────────────────────────────────────────────

  async update(id: string, dto: any): Promise<any> {
    const item = await this.<name>Model.findByIdAndUpdate(id, { $set: dto }, { new: true });
    if (!item) throw new BusinessException('ERROR_NOT_FOUND', 404);
    return { success: true, messages: [], data: item };
  }

  // ── DELETE (admin) ──────────────────────────────────────────────────────────

  async delete(id: string): Promise<any> {
    const result = await this.<name>Model.findByIdAndDelete(id);
    if (!result) throw new BusinessException('ERROR_NOT_FOUND', 404);
    return { success: true, messages: [], data: { deleted: true } };
  }
}
```

### Service Conventions:
- All methods return `{ success: true, messages: [], data: ... }` — the `ResponseInterceptor` passes this shape through unchanged
- Use `BusinessException('ERROR_KEY', statusCode)` for errors — the `GlobalExceptionFilter` handles these
- Use `.lean()` on read queries for performance (returns plain objects instead of Mongoose documents)
- Multi-language field resolution: pick the requested language, fallback to `en`
- The `Logger` is optional but recommended for debugging

---

## Step 3: Create the Controller

**File:** `src/modules/<module-name>/<module-name>.controller.ts`

```typescript
import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags, ApiProperty } from '@nestjs/swagger';
import { <Name>Service } from './<module-name>.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
// import { Public } from '../../common/decorators/public.decorator';  // ← use if endpoint needs NO auth

// ── DTOs ──────────────────────────────────────────────────────────────────────
// Define DTOs inline in the controller file (project convention).
// Use class-validator decorators for automatic validation (global ValidationPipe is active).

class Create<Name>Dto {
  @ApiProperty({ example: { es: 'Hola', en: 'Hello', fr: 'Bonjour', de: 'Hallo', it: 'Ciao', pt: 'Olá' } })
  @IsObject()
  title: Record<string, string>;

  @ApiProperty()
  @IsString()
  fieldName: string;
}

class Update<Name>Dto {
  @ApiProperty({ required: false })
  @IsOptional() @IsObject()
  title?: Record<string, string>;

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  active?: boolean;
}

// ── Controller ────────────────────────────────────────────────────────────────

@ApiTags('<Names>')                     // ← Swagger group name (plural, PascalCase)
@ApiBearerAuth()                        // ← All routes require JWT (global AuthGuard)
@Controller('<module-names>')           // ← URL path: /api/<module-names>
export class <Name>Controller {
  constructor(private readonly <name>Service: <Name>Service) {}

  // ── Public endpoints (require auth token but not admin) ─────────────────────

  @Get()
  @ApiOperation({ summary: 'List all active items (localized)' })
  findAll(@Headers('accept-language') lang: string) {
    return this.<name>Service.findAll(lang || 'en');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get item by ID (localized)' })
  @ApiParam({ name: 'id' })
  findById(@Param('id') id: string, @Headers('accept-language') lang: string) {
    return this.<name>Service.findById(id, lang || 'en');
  }

  // ── Admin-only endpoints ────────────────────────────────────────────────────

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '[Admin] Create item' })
  create(@Body() dto: Create<Name>Dto) {
    return this.<name>Service.create(dto);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '[Admin] Update item' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() dto: Update<Name>Dto) {
    return this.<name>Service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '[Admin] Delete item' })
  @ApiParam({ name: 'id' })
  delete(@Param('id') id: string) {
    return this.<name>Service.delete(id);
  }
}
```

### Controller Conventions:
- **DTOs** are defined inline in the controller file (not in a separate `dtos/` folder) — unless they're complex
- **`@ApiTags`** groups endpoints in Swagger UI
- **`@ApiBearerAuth`** adds the lock icon in Swagger
- **`@ApiOperation`** describes each endpoint
- **`@ApiParam`** documents URL parameters
- **Auth**: All routes require JWT by default (global `AuthGuard`). Use `@Public()` to skip auth. Use `@UseGuards(AdminGuard)` for admin-only
- **Language**: Read from `Accept-Language` header via `@Headers('accept-language')`
- **Validation**: The global `ValidationPipe({ whitelist: true, transform: true })` strips unknown fields and auto-validates DTOs

### Available Guards:
| Guard | Import | Usage |
|-------|--------|-------|
| `AuthGuard` | Global (APP_GUARD) | Applied to ALL routes by default |
| `AdminGuard` | `../../common/guards/admin.guard` | `@UseGuards(AdminGuard)` — checks admin email list |
| `@Public()` | `../../common/decorators/public.decorator` | Skips AuthGuard entirely |

### Available Decorators:
| Decorator | Import | Usage |
|-----------|--------|-------|
| `@CurrentUser()` | `../../common/decorators/current-user.decorator` | Extracts JWT payload: `{ id, email, iat, exp }` |
| `@Public()` | `../../common/decorators/public.decorator` | Makes endpoint public (no JWT) |

---

## Step 4: Create the Module

**File:** `src/modules/<module-name>/<module-name>.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { <Name>Controller } from './<module-name>.controller';
import { <Name>Service } from './<module-name>.service';
import { <Name>, <Name>Schema } from './schemas/<module-name>.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: <Name>.name, schema: <Name>Schema }])],
  controllers: [<Name>Controller],
  providers: [<Name>Service],
  exports: [<Name>Service],           // ← export if other modules need this service
})
export class <Name>Module {}
```

---

## Step 5: Register in app.module.ts

**File:** `src/app.module.ts`

Add two lines:

```typescript
// 1. Import at the top
import { <Name>Module } from './modules/<module-name>/<module-name>.module';

// 2. Add to the imports array
@Module({
  imports: [
    // ... existing modules
    <Name>Module,       // ← add here
  ],
})
```

---

## Step 6: Verify

After creating all files, run:

```bash
npx tsc --noEmit --pretty
```

This should compile with zero errors. Then restart the dev server:

```bash
npm run start
```

Verify the Swagger docs at the configured Swagger path to confirm all endpoints appear.

---

## 🔑 Response Format

ALL responses in this project follow this shape (enforced by `ResponseInterceptor`):

```json
{
  "success": true,
  "messages": [],
  "data": { ... }
}
```

For errors (handled by `GlobalExceptionFilter` + `BusinessException`):

```json
{
  "success": false,
  "messages": ["ERROR_NOT_FOUND"],
  "data": null
}
```

---

## 🌍 Multi-Language Support

The project supports **6 languages**: `es`, `en`, `fr`, `de`, `it`, `pt`.

### Schema pattern:
```typescript
@Schema({ _id: false })
class LanguageField {
  @Prop() es: string;
  @Prop() en: string;
  @Prop() fr: string;
  @Prop() de: string;
  @Prop() it: string;
  @Prop() pt: string;
}
```

### Resolution pattern (in service):
```typescript
const supported = ['es', 'en', 'fr', 'de', 'it', 'pt'];
const l = supported.includes(lang) ? lang : 'en';
// For simple resolution:
const value = item.title?.[l] ?? item.title?.en;
// For aggregation (random queries):
{ $project: { text: `$text.${l}` } }
```

### Client sends language via:
```
Accept-Language: es
```

---

## 📋 Checklist

When creating a new collection, verify:

- [ ] Schema created in `schemas/` with `versionKey: false, timestamps: true`
- [ ] Multi-language fields use the `LanguageField` pattern (if needed)
- [ ] Service uses `BusinessException` for errors (not raw `HttpException`)
- [ ] Service returns `{ success, messages, data }` shape
- [ ] Controller has `@ApiTags`, `@ApiBearerAuth`, `@ApiOperation` on every route
- [ ] Admin routes use `@UseGuards(AdminGuard)`
- [ ] DTOs use `class-validator` decorators (`@IsString`, `@IsOptional`, etc.)
- [ ] Module exports the service if other modules need it
- [ ] Module registered in `app.module.ts` (import + imports array)
- [ ] `npx tsc --noEmit` compiles clean
- [ ] Swagger shows correct endpoints
