// ============================================================================
//  BARRIÈRE D'ERREUR — empêche un écran blanc / fermeture en cas d'erreur JS
// ----------------------------------------------------------------------------
//  Capture les erreurs de rendu des composants enfants et affiche un message
//  lisible avec un bouton pour réessayer, au lieu de planter l'application.
// ============================================================================

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { erreur: null }
  }

  static getDerivedStateFromError(erreur) {
    return { erreur }
  }

  componentDidCatch(erreur, info) {
    console.error('Erreur capturée :', erreur, info)
  }

  reessayer = () => {
    this.setState({ erreur: null })
    if (this.props.onReset) this.props.onReset()
  }

  render() {
    if (this.state.erreur) {
      return (
        <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center gap-4">
          <div className="text-6xl">😕</div>
          <h2 className="text-xl font-bold">Un souci est survenu</h2>
          <p className="text-slate-400 text-sm max-w-xs">
            {String(this.state.erreur?.message || this.state.erreur)}
          </p>
          <button
            onClick={this.reessayer}
            className="bg-emerald-600 active:bg-emerald-700 text-white rounded-xl px-6 py-3 font-semibold mt-2"
          >
            🔄 Réessayer
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
