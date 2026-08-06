import { Injectable } from '@nestjs/common';

@Injectable()
export class SanitizerService {
  public stripXss(value: string): string {
    return value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '');
  }

  public escapeHtml(value: string): string {
    const characters: Readonly<Record<string, string>> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return value.replace(/[&<>"']/g, (character) => characters[character]);
  }
}
