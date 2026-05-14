import { db } from '../services/Database.js'
import { graphifyService } from '../services/GraphifyService.js'
import { contextModeService } from '../services/ContextModeService.js'
import { logger } from '../utils/logger.js'

export async function onSystemTransform(system: string): Promise<string> {
  try {
    const snapshot = db.getLatestSnapshot()
    const graphifyActive = db.getSetting('graphifyEnabled') === '1'
    const ctxModeActive = db.getSetting('contextModeEnabled') === '1'

    let injection = '\n\n<!-- Better Code Soul -->\n'

    if (graphifyActive) {
      injection += '- Proje bilgi grafigi aktif. Sorgular icin /bcs-graphify komutunu kullan.\n'

      const graphifyContext = await graphifyService.buildContextSummary(process.cwd(), '')
      if (graphifyContext) {
        injection += graphifyContext + '\n'
      }

      if (graphifyService.needsRebuild(process.cwd())) {
        injection += '- [BCS Uyari]: Graphify grafi 6 saatten eski. /bcs-graphify build ile guncelle.\n'
      }
    }

    if (ctxModeActive) {
      injection += "- Context Mode aktif. Ham tool output context'e girmez.\n"
    }

    if (snapshot) {
      injection += `- Onceki session: ${snapshot.summary}\n`
    }

    injection += [
      '- Buyuk/karmasik gorevler icin: /bcs-agent komutunu kullan',
      '- Planlama gerektiren gorevler: PLAN tier model kullan',
      '- Kod uretimi: KOD tier model kullan (ucuz + hizli)',
      '- Dogrulama: REVIEW tier model kullan (en ucuz)',
    ].join('\n')
    injection += '\n<!-- /Better Code Soul -->'

    return system + injection
  } catch (err) {
    logger.error('Error in systemTransform hook', err)
    return system
  }
}
