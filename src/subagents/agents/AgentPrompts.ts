import fs from 'node:fs'
import path from 'node:path'

export interface PlannerAgentOutput {
  architecture: string
  filesToCreate: Array<{ path: string; description: string }>
  filesToModify: Array<{ path: string; description: string }>
  dependencies: string[]
  notes: string
}

export class PlannerAgent {
  static readonly ROLE = 'Sen bir yazılım mimarısın. Sadece plan yap, KESİNLİKLE kod yazma.'

  static buildPrompt(request: string, context: string): string {
    return [
      `ROL: ${this.ROLE}`,
      '',
      context ? `BAĞLAM:\n${context}` : '',
      '',
      `GÖREV:\n${request}`,
      '',
      'CIKTI FORMATI:',
      '1. Mimari plan (kısa)',
      '2. Oluşturulacak dosyalar listesi (yol + açıklama)',
      '3. Değiştirilecek dosyalar listesi (yol + açıklama)',
      '4. Bağımlılıklar',
      '5. Notlar/riskler',
      '',
      'KESİNLİKLE UYULMASI GEREKEN: Sadece plan yap, kod yazma.',
    ].filter(Boolean).join('\n')
  }
}

export class CoderAgent {
  static readonly ROLE = "Sen bir senior developer'sın. Verilen görevi implement et. Sadece istenen dosyalar."

  static buildPrompt(task: string, context: string, files: string[]): string {
    return [
      `ROL: ${this.ROLE}`,
      '',
      context ? `BAĞLAM:\n${context}` : '',
      '',
      `GÖREV:\n${task}`,
      '',
      files.length > 0 ? `HEDEF DOSYALAR:\n${files.join('\n')}` : '',
      '',
      'KESİNLİKLE UYULMASI GEREKEN: İlk seferde çalışan çıktı üret. Emin değilsen eksik bırak, tahmin yürütme.',
    ].filter(Boolean).join('\n')
  }
}

export class ReviewerAgent {
  static readonly ROLE = 'Sen bir code reviewer\'sın. Kısa ve net ol. Sorun varsa belirt, yoksa "ONAYLANDI" yaz.'

  static buildPrompt(task: string, context: string): string {
    return [
      `ROL: ${this.ROLE}`,
      '',
      context ? `BAĞLAM:\n${context}` : '',
      '',
      `GÖREV:\n${task}`,
      '',
      'Kontrol listesi:',
      '- Tip hataları var mı?',
      '- Logic hatası var mı?',
      '- KURAL ihlali var mı?',
      '- Eksik import var mı?',
      '',
      'Sorun yoksa sadece "ONAYLANDI" yaz.',
    ].filter(Boolean).join('\n')
  }
}

export class ResearchAgent {
  static readonly ROLE = 'Sen bir teknik araştırmacısın. Dokümantasyon ve örneklerden kaynak göster.'

  static buildPrompt(task: string, context: string): string {
    return [
      `ROL: ${this.ROLE}`,
      '',
      context ? `BAĞLAM:\n${context}` : '',
      '',
      `GÖREV:\n${task}`,
      '',
      'Kaynakları belirt. Belgelenmiş bilgi kullan.',
    ].filter(Boolean).join('\n')
  }
}
