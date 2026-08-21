import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '../interfaces/channel-provider.interface';
import { templateRegistry, NotificationTemplate } from './definitions';

/**
 * Rendered template output with channel-specific content.
 */
export interface RenderedTemplate {
  title?: string;
  body: string;
  htmlBody?: string;
}

/**
 * Tenant branding tokens for email templates.
 */
export interface TenantBranding {
  logoUrl?: string;
  primaryColor?: string;
  appName?: string;
}

/**
 * Template Service
 *
 * Resolves notification templates by key, renders them with variable
 * interpolation, and returns channel-specific content (push title/body,
 * SMS text, email HTML).
 *
 * Supports:
 * - {{variableName}} interpolation
 * - Per-channel content variants
 * - HTML escaping for email channel
 * - Tenant branding injection for email
 */
@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  /**
   * Render a notification template for a specific channel.
   *
   * @param templateKey - Template identifier (e.g., 'otp.requested')
   * @param channel - Target channel for content variant selection
   * @param variables - Key-value pairs for template interpolation
   * @param branding - Optional tenant branding tokens for email
   * @returns Rendered template content or null if template not found
   */
  render(
    templateKey: string,
    channel: NotificationChannel,
    variables: Record<string, string> = {},
    branding?: TenantBranding,
  ): RenderedTemplate | null {
    const template = templateRegistry.get(templateKey);

    if (!template) {
      this.logger.warn(`Template not found: ${templateKey}`);
      return null;
    }

    const channelContent = template.channels[channel];

    if (!channelContent) {
      this.logger.warn(`Template '${templateKey}' has no content for channel '${channel}'`);
      return null;
    }

    const title = channelContent.title
      ? this.interpolate(channelContent.title, variables, false)
      : undefined;

    const body = this.interpolate(channelContent.body, variables, false);

    let htmlBody: string | undefined;
    if (channel === 'email' && channelContent.htmlBody) {
      const escapedVars = this.escapeHtmlVariables(variables);
      const renderedHtml = this.interpolate(channelContent.htmlBody, escapedVars, false);
      htmlBody = branding
        ? this.wrapWithBranding(renderedHtml, title || template.defaultTitle || '', branding)
        : renderedHtml;
    }

    return { title, body, htmlBody };
  }

  /**
   * Check if a template exists for a given key.
   */
  hasTemplate(templateKey: string): boolean {
    return templateRegistry.has(templateKey);
  }

  /**
   * Get available channels for a template.
   */
  getTemplateChannels(templateKey: string): NotificationChannel[] {
    const template = templateRegistry.get(templateKey);
    if (!template) return [];
    return Object.keys(template.channels) as NotificationChannel[];
  }

  /**
   * Interpolate variables into a template string.
   * Replaces {{variableName}} with the corresponding value.
   * Unknown variables are left as empty string.
   */
  private interpolate(
    template: string,
    variables: Record<string, string>,
    escapeHtml: boolean,
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key];
      if (value === undefined) {
        this.logger.debug(`Template variable not provided: ${key}`);
        return '';
      }
      return escapeHtml ? this.escapeHtml(value) : value;
    });
  }

  /**
   * Escape HTML special characters to prevent XSS in email content.
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Create a copy of variables with HTML-escaped values for email rendering.
   */
  private escapeHtmlVariables(variables: Record<string, string>): Record<string, string> {
    const escaped: Record<string, string> = {};
    for (const [key, value] of Object.entries(variables)) {
      escaped[key] = this.escapeHtml(value);
    }
    return escaped;
  }

  /**
   * Wrap HTML email content with tenant branding layout.
   */
  private wrapWithBranding(
    content: string,
    subject: string,
    branding: TenantBranding,
  ): string {
    const primaryColor = branding.primaryColor || '#FF6B3D';
    const appName = branding.appName || 'Vima';
    const logoHtml = branding.logoUrl
      ? `<img src="${branding.logoUrl}" alt="${appName}" style="max-height: 40px; margin-bottom: 20px;" />`
      : `<h2 style="color: ${primaryColor}; margin: 0 0 20px 0;">${appName}</h2>`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; border-bottom: 1px solid #e4e4e7;">
              ${logoHtml}
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; color: #71717a; text-align: center;">
                &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
