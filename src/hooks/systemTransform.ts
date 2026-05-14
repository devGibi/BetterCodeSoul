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
      injection += '- Proje bilgi grafiği aktif. Sorgular için /bcs-graphify komutunu kullan.\n'
    }
    if (ctxModeActive) {
      injection += "- Context Mode aktif. Ham tool output context'e girmiyor.\n"
    }
    if (snapshot) {
      injection += `- Önceki session: ${snapshot.summary}\n`
    }

    return system + injection
  } catch (err) {
    logger.error('Error in systemTransform hook', err)
    return system
  }
}
