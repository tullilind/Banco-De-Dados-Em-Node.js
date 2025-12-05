// ARSOLUSSGURITY.js
// Sistema de Proteção de Interface e Bloqueio de Inspeção

(function() {
    'use strict';

    console.log("🔒 ARSOLUSSGURITY Protection Active");

    // 1. Bloquear Botão Direito (Menu de Contexto)
    document.addEventListener('contextmenu', event => {
        event.preventDefault();
        return false;
    });

    // 2. Bloquear Atalhos de Teclado (F12, Ctrl+U, Ctrl+Shift+I, etc)
    document.addEventListener('keydown', event => {
        
        // F12 (Developer Tools)
        if (event.key === 'F12' || event.keyCode === 123) {
            event.preventDefault();
            return false;
        }

        // Combinações com CTRL + SHIFT
        if (event.ctrlKey && event.shiftKey) {
            // I (Inspector), J (Console), C (Elements)
            if (event.key === 'I' || event.key === 'J' || event.key === 'C' || event.key === 'i' || event.key === 'j' || event.key === 'c') {
                event.preventDefault();
                return false;
            }
        }

        // Combinações com CTRL
        if (event.ctrlKey) {
            // U (Ver Código Fonte), S (Salvar Página), P (Imprimir)
            if (event.key === 'u' || event.key === 'U' || event.key === 's' || event.key === 'S' || event.key === 'p' || event.key === 'P') {
                event.preventDefault();
                return false;
            }
        }
    });

    // 3. Bloquear Seleção de Texto e Arrastar Imagens (Cópia)
    // Impede que o usuário selecione texto para dar Ctrl+C
    document.addEventListener('selectstart', event => {
        event.preventDefault();
    });

    // Impede arrastar imagens para fora (salvar)
    document.addEventListener('dragstart', event => {
        event.preventDefault();
    });

})();