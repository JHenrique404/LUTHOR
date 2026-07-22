/**
 * Ciclo de vida janela × bandeja, isolado do Electron para ser testável.
 *
 * Regras:
 * - Fechar (X) NÃO encerra o app nem o SimulationEngine: a janela é ocultada
 *   e o processo segue vivo na bandeja.
 * - Só a saída explícita ("Sair do LUTHOR" / before-quit) encerra de verdade.
 * - Na primeira ocultação, o host pode notificar o usuário (balloon).
 */
export interface LifecycleHost {
  hideWindow(): void
  /** Restaura (se minimizada), mostra e foca a janela. */
  showWindow(): void
  quit(): void
  /** Aviso único: "LUTHOR continua ativo na bandeja". */
  notifyFirstHide(): void
}

export class WindowLifecycle {
  private quitting = false
  private notifiedFirstHide = false

  constructor(private readonly host: LifecycleHost) {}

  /**
   * Chamado no evento 'close' da janela.
   * Retorna true quando o fechamento deve ser PREVENIDO (ocultar em vez de
   * encerrar); false deixa o fechamento real prosseguir (saída explícita).
   */
  handleWindowClose(): boolean {
    if (this.quitting) return false
    this.host.hideWindow()
    if (!this.notifiedFirstHide) {
      this.notifiedFirstHide = true
      this.host.notifyFirstHide()
    }
    return true
  }

  /** Clique no ícone da bandeja / "Abrir LUTHOR" / app activate. */
  handleActivate(): void {
    this.host.showWindow()
  }

  /** "Sair do LUTHOR": encerramento real, sem cair no comportamento de ocultar. */
  requestQuit(): void {
    this.quitting = true
    this.host.quit()
  }

  /** before-quit vindo do sistema (ex.: shutdown) também é saída real. */
  markQuitting(): void {
    this.quitting = true
  }

  isQuitting(): boolean {
    return this.quitting
  }
}
