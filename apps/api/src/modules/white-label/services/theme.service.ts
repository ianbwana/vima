import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import * as cpSchema from '../../../database/schemas/control-plane.schema';
import { ThemeTokens } from '../dto/white-label.dto';

/**
 * Required fields in a theme token document.
 */
const REQUIRED_COLOR_KEYS = ['primary', 'onPrimary'];

/**
 * ThemeService
 *
 * Manages tenant theme tokens — the design system configuration that
 * drives white-labeling across PWA, native apps, and email templates.
 *
 * Supports:
 * - Save draft theme (validation + persist)
 * - Publish theme (marks as active for runtime consumption)
 * - Version history (each save creates a new version)
 * - Token validation (required fields, color format)
 * - Preview (returns unpublished draft tokens)
 */
@Injectable()
export class ThemeService {
  private readonly logger = new Logger(ThemeService.name);

  constructor(private readonly controlPlaneDb: ControlPlaneDbService) {}

  /**
   * Save a theme token document (creates a new version).
   * Optionally publishes it immediately.
   */
  async saveTheme(tenantId: string, tokens: ThemeTokens, publish: boolean = false) {
    this.validateTokens(tokens);

    const db = this.controlPlaneDb.db;

    // Get current max version
    const [latest] = await db
      .select({ version: cpSchema.tenantThemes.version })
      .from(cpSchema.tenantThemes)
      .where(eq(cpSchema.tenantThemes.tenantId, tenantId))
      .orderBy(desc(cpSchema.tenantThemes.version))
      .limit(1);

    const nextVersion = (latest?.version ?? 0) + 1;

    // If publishing, unpublish all existing themes for this tenant
    if (publish) {
      await db
        .update(cpSchema.tenantThemes)
        .set({ published: false })
        .where(eq(cpSchema.tenantThemes.tenantId, tenantId));
    }

    // Insert new theme version
    const [theme] = await db
      .insert(cpSchema.tenantThemes)
      .values({
        tenantId,
        tokens: tokens as any,
        published: publish,
        version: nextVersion,
      })
      .returning();

    this.logger.log(`Theme saved: tenant=${tenantId} version=${nextVersion} published=${publish}`);
    return theme;
  }

  /**
   * Get the currently published theme for a tenant.
   * Used at runtime by PWA and apps.
   */
  async getPublishedTheme(tenantId: string): Promise<ThemeTokens | null> {
    const db = this.controlPlaneDb.db;

    const [theme] = await db
      .select()
      .from(cpSchema.tenantThemes)
      .where(and(eq(cpSchema.tenantThemes.tenantId, tenantId), eq(cpSchema.tenantThemes.published, true)))
      .limit(1);

    return theme ? (theme.tokens as unknown as ThemeTokens) : null;
  }

  /**
   * Get the latest theme (published or draft) for preview.
   */
  async getLatestTheme(tenantId: string) {
    const db = this.controlPlaneDb.db;

    const [theme] = await db
      .select()
      .from(cpSchema.tenantThemes)
      .where(eq(cpSchema.tenantThemes.tenantId, tenantId))
      .orderBy(desc(cpSchema.tenantThemes.version))
      .limit(1);

    return theme || null;
  }

  /**
   * Publish a specific theme version.
   */
  async publishTheme(tenantId: string, themeId: string) {
    const db = this.controlPlaneDb.db;

    // Unpublish all
    await db
      .update(cpSchema.tenantThemes)
      .set({ published: false })
      .where(eq(cpSchema.tenantThemes.tenantId, tenantId));

    // Publish the specified one
    const [published] = await db
      .update(cpSchema.tenantThemes)
      .set({ published: true })
      .where(and(eq(cpSchema.tenantThemes.id, themeId), eq(cpSchema.tenantThemes.tenantId, tenantId)))
      .returning();

    if (!published) throw new NotFoundException('Theme not found');

    this.logger.log(`Theme published: tenant=${tenantId} id=${themeId} version=${published.version}`);
    return published;
  }

  /**
   * List all theme versions for a tenant.
   */
  async listThemeVersions(tenantId: string) {
    const db = this.controlPlaneDb.db;
    return db
      .select()
      .from(cpSchema.tenantThemes)
      .where(eq(cpSchema.tenantThemes.tenantId, tenantId))
      .orderBy(desc(cpSchema.tenantThemes.version));
  }

  /**
   * Validate theme tokens structure.
   */
  private validateTokens(tokens: ThemeTokens): void {
    if (!tokens.colors) {
      throw new BadRequestException('Theme tokens must include a "colors" object');
    }

    for (const key of REQUIRED_COLOR_KEYS) {
      if (!(tokens.colors as any)[key]) {
        throw new BadRequestException(`Theme colors must include "${key}"`);
      }
    }

    if (!tokens.typography?.fontFamily) {
      throw new BadRequestException('Theme tokens must include typography.fontFamily');
    }

    // Validate color format (hex)
    const colorValues = Object.values(tokens.colors).filter(Boolean) as string[];
    for (const color of colorValues) {
      if (!this.isValidColor(color)) {
        throw new BadRequestException(`Invalid color value: "${color}". Use hex format (#RRGGBB)`);
      }
    }
  }

  private isValidColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{3,8}$/.test(color);
  }
}
