/**
 * Lógica Principal do Jogo de Xadrez.
 * Suporta Modo Local, vs Computador (IA Minimax) e Modo Online (P2P WebRTC / Servidor Local).
 */

class ChessApp {
    constructor() {
        this.game = new Chess();
        this.gameMode = '2p'; // '2p', 'cpu-easy', 'cpu-medium', 'cpu-hard', 'online'
        this.onlineEngine = 'p2p'; // 'p2p' (PeerJS) ou 'server' (Python API)
        this.myColor = 'w';
        this.boardFlipped = false;
        
        this.selectedSquare = null;
        this.possibleMoves = [];
        this.lastMove = null;
        this.pendingPromotionMove = null;
        
        this.isCpuThinking = false;
        this.isOnline = false;
        this.roomStatus = 'idle'; // 'idle', 'waiting', 'playing', 'finished'
        this.roomCode = null;
        this.isHost = false;

        // Conexão P2P (PeerJS)
        this.peer = null;
        this.conn = null;

        // Polling do Servidor Local
        this.serverPollInterval = null;
        this.lastMoveCount = -1;
        this.lastChatId = -1;

        // Relógios
        this.timeControl = 0; // segundos (0 = sem tempo)
        this.whiteTime = 0;
        this.blackTime = 0;
        this.clockTimer = null;

        // Histórico de lances
        this.moveHistory = [];

        this.initDOM();
        this.initEvents();
        this.checkURLParams();
        this.newGame();
    }

    initDOM() {
        this.boardEl = document.getElementById('board');
        this.statusBadgeEl = document.getElementById('status-badge');
        this.statusTextEl = document.getElementById('status-text');
        this.modeSelectEl = document.getElementById('game-mode');
        this.flipBtn = document.getElementById('btn-flip');
        this.undoBtn = document.getElementById('btn-undo');
        this.restartBtn = document.getElementById('btn-restart');
        this.muteBtn = document.getElementById('btn-mute');

        // Controles Online
        this.onlineCardEl = document.getElementById('online-card');
        this.onlineSetupEl = document.getElementById('online-setup');
        this.onlineLobbyEl = document.getElementById('online-lobby');
        this.onlineActiveEl = document.getElementById('online-active');
        this.roomCodeDisplayEl = document.getElementById('display-room-code');
        this.btnCreateRoom = document.getElementById('btn-create-room');
        this.btnJoinRoom = document.getElementById('btn-join-room');
        this.roomCodeInput = document.getElementById('room-code-input');
        this.btnCopyLink = document.getElementById('btn-copy-link');
        this.btnCopyCode = document.getElementById('btn-copy-code');
        this.onlineEngineSelect = document.getElementById('online-engine-select');
        this.onlineTimeSelect = document.getElementById('online-time-select');
        this.onlineColorSelect = document.getElementById('online-color-select');
        this.btnResign = document.getElementById('btn-resign');
        this.btnOfferDraw = document.getElementById('btn-offer-draw');
        this.btnRematch = document.getElementById('btn-rematch');

        // Painéis de Jogadores
        this.topPlayerCard = document.getElementById('top-player-card');
        this.bottomPlayerCard = document.getElementById('bottom-player-card');
        this.topPlayerAvatar = document.getElementById('top-player-avatar');
        this.bottomPlayerAvatar = document.getElementById('bottom-player-avatar');
        this.topPlayerName = document.getElementById('top-player-name');
        this.bottomPlayerName = document.getElementById('bottom-player-name');
        this.topClockEl = document.getElementById('top-clock');
        this.bottomClockEl = document.getElementById('bottom-clock');
        this.topCapturedEl = document.getElementById('top-captured');
        this.bottomCapturedEl = document.getElementById('bottom-captured');
        this.topAdvantageEl = document.getElementById('top-advantage');
        this.bottomAdvantageEl = document.getElementById('bottom-advantage');

        // Modal de Promoção
        this.promotionModal = document.getElementById('promotion-modal');
        this.promotionPiecesEl = document.getElementById('promotion-pieces');

        // Histórico
        this.historyListEl = document.getElementById('history-list');

        // Toast & Reações
        this.toastEl = document.getElementById('toast');
        this.reactionContainer = document.getElementById('reaction-container');
    }

    initEvents() {
        // Alternância de modo de jogo
        this.modeSelectEl.addEventListener('change', (e) => {
            this.handleModeChange(e.target.value);
        });

        // Inverter tabuleiro
        this.flipBtn.addEventListener('click', () => {
            this.boardFlipped = !this.boardFlipped;
            this.renderBoard();
        });

        // Desfazer jogada
        this.undoBtn.addEventListener('click', () => {
            if (this.isOnline || this.isCpuThinking) return;
            this.game.undo();
            if (this.gameMode.startsWith('cpu-')) {
                this.game.undo(); // Desfaz a jogada da CPU também
            }
            this.lastMove = null;
            this.selectedSquare = null;
            this.possibleMoves = [];
            this.updateMoveHistory();
            this.updateCapturedPieces();
            this.renderBoard();
        });

        // Reiniciar
        this.restartBtn.addEventListener('click', () => {
            if (this.isOnline) {
                if (confirm('Deseja desistir da partida online atual?')) {
                    this.sendAction('resign');
                }
                return;
            }
            this.newGame();
        });

        // Mudo / Som
        this.muteBtn.addEventListener('click', () => {
            const muted = window.chessAudio.toggleMute();
            this.muteBtn.innerHTML = muted 
                ? '<i class="fas fa-volume-mute"></i>' 
                : '<i class="fas fa-volume-up"></i>';
            this.showToast(muted ? 'Áudio desativado' : 'Áudio ativado');
        });

        // Ações do Modo Online
        this.btnCreateRoom.addEventListener('click', () => this.createOnlineRoom());
        this.btnJoinRoom.addEventListener('click', () => this.joinOnlineRoom());
        this.roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinOnlineRoom();
        });

        this.btnCopyLink.addEventListener('click', () => {
            const link = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}&engine=${this.onlineEngine}`;
            this.copyToClipboard(link, 'Link de convite copiado!');
        });

        this.btnCopyCode.addEventListener('click', () => {
            this.copyToClipboard(this.roomCode, 'Código copiado!');
        });

        this.btnResign.addEventListener('click', () => {
            if (confirm('Tem certeza de que deseja desistir da partida?')) {
                this.sendAction('resign');
                this.handleResign(this.myColor);
            }
        });

        this.btnOfferDraw.addEventListener('click', () => {
            this.sendAction('offer_draw');
            this.showToast('Proposta de empate enviada!');
        });

        this.btnRematch.addEventListener('click', () => {
            this.sendAction('request_rematch');
            this.showToast('Pedido de revanche enviado!');
            this.btnRematch.disabled = true;
            this.btnRematch.classList.add('opacity-50');
        });

        // Chat rápido / Emojis
        document.querySelectorAll('.btn-emoji').forEach(btn => {
            btn.addEventListener('click', () => {
                const emoji = btn.getAttribute('data-emoji');
                this.sendChat('', emoji);
                this.showReaction(emoji, true);
            });
        });

        const chatInput = document.getElementById('chat-text-input');
        const chatSendBtn = document.getElementById('btn-send-chat');
        const sendMsg = () => {
            const text = chatInput.value.trim();
            if (!text) return;
            this.sendChat(text, '');
            this.showToast(`Você: ${text}`);
            chatInput.value = '';
        };
        if (chatSendBtn) chatSendBtn.addEventListener('click', sendMsg);
        if (chatInput) chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMsg();
        });

        // Modal de Promoção
        ['q', 'r', 'b', 'n'].forEach(type => {
            const btn = document.getElementById(`promo-${type}`);
            if (btn) {
                btn.addEventListener('click', () => this.confirmPromotion(type));
            }
        });
    }

    checkURLParams() {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        const engine = params.get('engine');
        if (room) {
            this.modeSelectEl.value = 'online';
            this.handleModeChange('online');
            if (engine) this.onlineEngineSelect.value = engine;
            this.roomCodeInput.value = room.toUpperCase();
            this.showToast(`Código de sala detectado: ${room.toUpperCase()}`);
        }
    }

    newGame() {
        this.game.reset();
        this.selectedSquare = null;
        this.possibleMoves = [];
        this.lastMove = null;
        this.pendingPromotionMove = null;
        this.isCpuThinking = false;
        this.moveHistory = [];

        if (this.gameMode === 'online') {
            this.boardFlipped = (this.myColor === 'b');
        } else {
            this.myColor = 'w';
            this.boardFlipped = false;
        }

        this.initClocks();
        this.updateMoveHistory();
        this.updateCapturedPieces();
        this.renderBoard();
        this.updateStatus();
    }

    handleModeChange(newMode) {
        this.gameMode = newMode;
        this.isOnline = (newMode === 'online');

        if (this.isOnline) {
            this.onlineCardEl.classList.remove('hidden');
            this.undoBtn.classList.add('opacity-40', 'pointer-events-none');
            this.restartBtn.innerText = 'Desistir';
            this.showOnlineSetup();
        } else {
            this.onlineCardEl.classList.add('hidden');
            this.undoBtn.classList.remove('opacity-40', 'pointer-events-none');
            this.restartBtn.innerText = 'Reiniciar';
            this.cleanupOnline();
            this.newGame();
        }
    }

    // --- RENDERIZAÇÃO DO TABULEIRO ---
    renderBoard() {
        this.boardEl.innerHTML = '';
        const board = this.game.board();

        // 8x8 squares
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                // Se invertido, linha 0 representa o rank 1 e coluna 0 representa 'h'
                const actualRow = this.boardFlipped ? 7 - r : r;
                const actualCol = this.boardFlipped ? 7 - c : c;

                const file = String.fromCharCode('a'.charCodeAt(0) + actualCol);
                const rank = 8 - actualRow;
                const squareId = file + rank;

                const piece = board[actualRow][actualCol];
                const isLightSquare = (actualRow + actualCol) % 2 === 0;

                const squareEl = document.createElement('div');
                squareEl.className = `relative flex items-center justify-center select-none ${
                    isLightSquare 
                        ? 'bg-[#f0d9b5] dark:bg-[#6b7280]' 
                        : 'bg-[#b58863] dark:bg-[#374151]'
                }`;
                squareEl.dataset.square = squareId;

                // Coordenadas nas bordas
                if (r === 7) {
                    const fileLabel = document.createElement('span');
                    fileLabel.className = `absolute bottom-0.5 right-1 text-[10px] sm:text-xs font-bold pointer-events-none ${
                        isLightSquare ? 'text-[#b58863] dark:text-[#374151]' : 'text-[#f0d9b5] dark:text-[#6b7280]'
                    }`;
                    fileLabel.innerText = file;
                    squareEl.appendChild(fileLabel);
                }
                if (c === 0) {
                    const rankLabel = document.createElement('span');
                    rankLabel.className = `absolute top-0.5 left-1 text-[10px] sm:text-xs font-bold pointer-events-none ${
                        isLightSquare ? 'text-[#b58863] dark:text-[#374151]' : 'text-[#f0d9b5] dark:text-[#6b7280]'
                    }`;
                    rankLabel.innerText = rank;
                    squareEl.appendChild(rankLabel);
                }

                // Destaque do último movimento
                if (this.lastMove && (squareId === this.lastMove.from || squareId === this.lastMove.to)) {
                    const highlight = document.createElement('div');
                    highlight.className = 'absolute inset-0 bg-yellow-400/40 pointer-events-none';
                    squareEl.appendChild(highlight);
                }

                // Destaque da casa selecionada
                if (this.selectedSquare === squareId) {
                    const highlight = document.createElement('div');
                    highlight.className = 'absolute inset-0 bg-green-500/50 pointer-events-none';
                    squareEl.appendChild(highlight);
                }

                // Destaque do rei em xeque
                if (piece && piece.type === 'k' && piece.color === this.game.turn() && this.game.in_check()) {
                    const checkHighlight = document.createElement('div');
                    checkHighlight.className = 'absolute inset-0 bg-red-600/60 animate-pulse pointer-events-none';
                    squareEl.appendChild(checkHighlight);
                }

                // Renderiza a peça
                if (piece) {
                    const pieceKey = `${piece.color}${piece.type.toUpperCase()}`;
                    const pieceEl = document.createElement('div');
                    pieceEl.className = 'w-full h-full p-1 flex items-center justify-center cursor-grab active:cursor-grabbing z-10 piece-svg';
                    pieceEl.draggable = true;
                    pieceEl.innerHTML = PIECE_SVGS[pieceKey] || '';
                    
                    // Eventos de Drag & Drop
                    pieceEl.addEventListener('dragstart', (e) => this.handleDragStart(e, squareId));
                    pieceEl.addEventListener('dragend', (e) => this.handleDragEnd(e));

                    squareEl.appendChild(pieceEl);
                }

                // Indicador de movimento possível
                const moveHint = this.possibleMoves.find(m => m.to === squareId);
                if (moveHint) {
                    const hintEl = document.createElement('div');
                    if (piece) {
                        hintEl.className = 'absolute inset-0 m-auto w-full h-full rounded-full border-4 border-black/30 dark:border-white/40 pointer-events-none z-20';
                    } else {
                        hintEl.className = 'absolute inset-0 m-auto w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-black/25 dark:bg-white/35 pointer-events-none z-20';
                    }
                    squareEl.appendChild(hintEl);
                }

                // Eventos de Clique e Drop na casa
                squareEl.addEventListener('click', () => this.handleSquareClick(squareId));
                squareEl.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                });
                squareEl.addEventListener('drop', (e) => this.handleDrop(e, squareId));

                this.boardEl.appendChild(squareEl);
            }
        }
    }

    // --- INTERAÇÕES DO JOGADOR ---
    handleSquareClick(squareId) {
        if (this.game.game_over() || this.isCpuThinking) return;

        // No modo online, só pode jogar se for sua vez e a partida estiver ativa
        if (this.isOnline) {
            if (this.roomStatus !== 'playing') return;
            if (this.game.turn() !== this.myColor) return;
        }

        if (this.selectedSquare) {
            const move = this.possibleMoves.find(m => m.to === squareId);
            if (move) {
                this.executeMove(move);
                return;
            }

            const piece = this.game.get(squareId);
            if (piece && piece.color === this.game.turn()) {
                if (this.isOnline && piece.color !== this.myColor) return;
                this.selectSquare(squareId);
                return;
            }

            this.selectedSquare = null;
            this.possibleMoves = [];
            this.renderBoard();
        } else {
            const piece = this.game.get(squareId);
            if (piece && piece.color === this.game.turn()) {
                if (this.isOnline && piece.color !== this.myColor) return;
                this.selectSquare(squareId);
            }
        }
    }

    selectSquare(squareId) {
        this.selectedSquare = squareId;
        this.possibleMoves = this.game.moves({ square: squareId, verbose: true });
        this.renderBoard();
    }

    handleDragStart(e, squareId) {
        if (this.game.game_over() || this.isCpuThinking) {
            e.preventDefault();
            return;
        }
        if (this.isOnline) {
            if (this.roomStatus !== 'playing') { e.preventDefault(); return; }
            if (this.game.turn() !== this.myColor) { e.preventDefault(); return; }
        }

        const piece = this.game.get(squareId);
        if (!piece || piece.color !== this.game.turn()) {
            e.preventDefault();
            return;
        }
        if (this.isOnline && piece.color !== this.myColor) {
            e.preventDefault();
            return;
        }

        this.selectSquare(squareId);
        e.dataTransfer.setData('text/plain', squareId);
    }

    handleDragEnd(e) {
        // Nada crítico necessário aqui
    }

    handleDrop(e, targetSquare) {
        e.preventDefault();
        const fromSquare = e.dataTransfer.getData('text/plain');
        if (!fromSquare) return;

        const move = this.possibleMoves.find(m => m.to === targetSquare);
        if (move) {
            this.executeMove(move);
        } else {
            this.selectedSquare = null;
            this.possibleMoves = [];
            this.renderBoard();
        }
    }

    // --- EXECUÇÃO DE JOGADAS ---
    executeMove(moveObj) {
        // Se for promoção de peão
        if (moveObj.flags.includes('p') || moveObj.flags.includes('cp')) {
            this.pendingPromotionMove = moveObj;
            this.showPromotionModal();
            return;
        }

        const result = this.game.move({
            from: moveObj.from,
            to: moveObj.to,
            promotion: 'q'
        });

        if (result) {
            this.onMoveSuccess(result);
        }
    }

    showPromotionModal() {
        const color = this.game.turn();
        ['q', 'r', 'b', 'n'].forEach(type => {
            const btn = document.getElementById(`promo-${type}`);
            if (btn) {
                btn.innerHTML = PIECE_SVGS[`${color}${type.toUpperCase()}`];
            }
        });
        this.promotionModal.classList.remove('hidden');
    }

    confirmPromotion(pieceType) {
        this.promotionModal.classList.add('hidden');
        if (!this.pendingPromotionMove) return;

        const result = this.game.move({
            from: this.pendingPromotionMove.from,
            to: this.pendingPromotionMove.to,
            promotion: pieceType
        });

        this.pendingPromotionMove = null;
        if (result) {
            this.onMoveSuccess(result);
        }
    }

    onMoveSuccess(result) {
        this.lastMove = { from: result.from, to: result.to };
        this.selectedSquare = null;
        this.possibleMoves = [];

        // Efeitos sonoros
        if (result.flags.includes('k') || result.flags.includes('q')) {
            window.chessAudio.playCastle();
        } else if (result.captured) {
            window.chessAudio.playCapture();
        } else {
            window.chessAudio.playMove();
        }

        if (this.game.in_check()) {
            setTimeout(() => window.chessAudio.playCheck(), 120);
        }

        this.updateMoveHistory();
        this.updateCapturedPieces();
        this.renderBoard();
        this.updateStatus();

        // Envia jogada se estiver online
        if (this.isOnline) {
            this.sendMove(result);
        }

        // Verifica fim de jogo
        if (this.game.game_over()) {
            this.handleGameOver();
            return;
        }

        // Se estiver contra CPU e for vez das Pretas
        if (this.gameMode.startsWith('cpu-') && this.game.turn() === 'b') {
            this.triggerCpuMove();
        }
    }

    // --- CONTRA A CPU ---
    triggerCpuMove() {
        this.isCpuThinking = true;
        this.updateStatus();

        const difficulty = this.gameMode.replace('cpu-', '');
        const thinkDelay = difficulty === 'easy' ? 400 : (difficulty === 'medium' ? 600 : 800);

        setTimeout(() => {
            const move = window.chessAI.calculateMove(this.game, difficulty);
            this.isCpuThinking = false;

            if (move) {
                const result = this.game.move(move);
                if (result) {
                    this.onMoveSuccess(result);
                }
            }
        }, thinkDelay);
    }

    // --- ATUALIZAÇÕES VISUAIS DE STATUS ---
    updatePlayerCards() {
        const topColor = this.boardFlipped ? 'w' : 'b';
        const bottomColor = this.boardFlipped ? 'b' : 'w';

        this.topPlayerAvatar.innerText = topColor === 'w' ? '⚪' : '⚫';
        this.topPlayerAvatar.className = topColor === 'w' 
            ? 'w-8 h-8 rounded-full bg-white text-gray-800 border-2 border-gray-300 flex items-center justify-center font-bold text-sm shadow'
            : 'w-8 h-8 rounded-full bg-gray-800 text-white flex items-center justify-center font-bold text-sm shadow';

        this.bottomPlayerAvatar.innerText = bottomColor === 'w' ? '⚪' : '⚫';
        this.bottomPlayerAvatar.className = bottomColor === 'w' 
            ? 'w-8 h-8 rounded-full bg-white text-gray-800 border-2 border-gray-300 flex items-center justify-center font-bold text-sm shadow'
            : 'w-8 h-8 rounded-full bg-gray-800 text-white flex items-center justify-center font-bold text-sm shadow';

        if (this.isOnline) {
            this.bottomPlayerName.innerText = `Você (${bottomColor === 'w' ? 'Brancas' : 'Pretas'})`;
            this.topPlayerName.innerText = `Oponente (${topColor === 'w' ? 'Brancas' : 'Pretas'})`;
        } else if (this.gameMode.startsWith('cpu-')) {
            const diffName = this.gameMode === 'cpu-easy' ? 'Fácil' : (this.gameMode === 'cpu-medium' ? 'Médio' : 'Difícil');
            this.bottomPlayerName.innerText = 'Você (Brancas)';
            this.topPlayerName.innerText = `Computador (${diffName})`;
        } else {
            this.bottomPlayerName.innerText = bottomColor === 'w' ? 'Brancas' : 'Pretas';
            this.topPlayerName.innerText = topColor === 'w' ? 'Brancas' : 'Pretas';
        }
    }

    updateStatus() {
        this.updatePlayerCards();
        const turnColor = this.game.turn();
        const turnName = turnColor === 'w' ? 'Brancas' : 'Pretas';

        // Atualiza destaque dos cartões de jogadores (topo vs base)
        const topColor = this.boardFlipped ? 'w' : 'b';
        if (turnColor === topColor) {
            this.topPlayerCard.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50/50', 'dark:bg-blue-900/20');
            this.bottomPlayerCard.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50/50', 'dark:bg-blue-900/20');
        } else {
            this.bottomPlayerCard.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50/50', 'dark:bg-blue-900/20');
            this.topPlayerCard.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50/50', 'dark:bg-blue-900/20');
        }

        if (this.game.game_over()) {
            if (this.game.in_checkmate()) {
                const winner = turnColor === 'w' ? 'Pretas' : 'Brancas';
                this.statusTextEl.innerHTML = `🏆 <b>Xeque-mate!</b> Vitória das ${winner}!`;
            } else if (this.game.in_draw()) {
                this.statusTextEl.innerHTML = `🤝 <b>Empate!</b> (50 lances)`;
            } else if (this.game.in_stalemate()) {
                this.statusTextEl.innerHTML = `🤝 <b>Empate por Afogamento!</b>`;
            } else if (this.game.in_threefold_repetition()) {
                this.statusTextEl.innerHTML = `🤝 <b>Empate por Repetição!</b>`;
            } else {
                this.statusTextEl.innerHTML = `🤝 <b>Fim de jogo (Empate)!</b>`;
            }
            return;
        }

        if (this.isOnline) {
            if (this.roomStatus === 'waiting') {
                this.statusTextEl.innerHTML = `<span class="inline-flex items-center gap-2 text-purple-600 dark:text-purple-400 font-bold"><i class="fas fa-spinner fa-spin"></i> Aguardando oponente entrar na sala...</span>`;
                return;
            }
            if (this.roomStatus === 'playing') {
                if (turnColor === this.myColor) {
                    this.statusTextEl.innerHTML = `<span class="text-green-600 dark:text-green-400 font-bold">🟢 Sua vez de jogar (${this.myColor === 'w' ? 'Brancas' : 'Pretas'})!</span>`;
                } else {
                    this.statusTextEl.innerHTML = `<span class="text-gray-500 dark:text-gray-400">⏳ Vez do oponente (${this.myColor === 'w' ? 'Pretas' : 'Brancas'})...</span>`;
                }
                if (this.game.in_check()) {
                    this.statusTextEl.innerHTML += ` <span class="text-red-500 font-extrabold">(XEQUE!)</span>`;
                }
                return;
            }
        }

        if (this.isCpuThinking) {
            this.statusTextEl.innerHTML = `🤖 <span class="text-indigo-600 dark:text-indigo-400 font-bold">Computador pensando...</span>`;
            return;
        }

        let txt = `Vez das <b>${turnName}</b>`;
        if (this.game.in_check()) {
            txt += ` <span class="text-red-500 font-extrabold">(XEQUE!)</span>`;
        }
        this.statusTextEl.innerHTML = txt;
    }

    handleGameOver() {
        this.stopClocks();
        const isWin = (this.game.in_checkmate() && this.game.turn() !== this.myColor);
        window.chessAudio.playGameEnd(isWin);

        if (this.isOnline) {
            this.roomStatus = 'finished';
            this.btnRematch.disabled = false;
            this.btnRematch.classList.remove('opacity-50');
        }
    }

    handleResign(resignedColor) {
        this.stopClocks();
        const winner = resignedColor === 'w' ? 'Pretas' : 'Brancas';
        this.statusTextEl.innerHTML = `🏳️ As ${resignedColor === 'w' ? 'Brancas' : 'Pretas'} desistiram! Vitória das <b>${winner}</b>!`;
        window.chessAudio.playGameEnd(resignedColor !== this.myColor);
        if (this.isOnline) {
            this.roomStatus = 'finished';
            this.btnRematch.disabled = false;
            this.btnRematch.classList.remove('opacity-50');
        }
    }

    // --- PEÇAS CAPTURADAS E VANTAGEM MATERIAL ---
    updateCapturedPieces() {
        const startingPieces = {
            p: 8, n: 2, b: 2, r: 2, q: 1
        };
        const currentWhite = { p: 0, n: 0, b: 0, r: 0, q: 0 };
        const currentBlack = { p: 0, n: 0, b: 0, r: 0, q: 0 };

        const board = this.game.board();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece.type !== 'k') {
                    if (piece.color === 'w') currentWhite[piece.type]++;
                    else currentBlack[piece.type]++;
                }
            }
        }

        // Peças brancas capturadas pelas pretas
        const capturedWhite = [];
        // Peças pretas capturadas pelas brancas
        const capturedBlack = [];

        ['q', 'r', 'b', 'n', 'p'].forEach(type => {
            const lostWhite = startingPieces[type] - currentWhite[type];
            for (let i = 0; i < lostWhite; i++) capturedWhite.push(type);

            const lostBlack = startingPieces[type] - currentBlack[type];
            for (let i = 0; i < lostBlack; i++) capturedBlack.push(type);
        });

        // Renderiza ícones de peças capturadas adaptados à orientação do tabuleiro
        const topColor = this.boardFlipped ? 'w' : 'b';
        const bottomColor = this.boardFlipped ? 'b' : 'w';

        // O jogador de cima capturou peças do jogador de baixo
        const topCapturedList = (topColor === 'w') ? capturedBlack : capturedWhite;
        const bottomCapturedList = (bottomColor === 'w') ? capturedBlack : capturedWhite;

        this.topCapturedEl.innerHTML = topCapturedList.map(t => 
            `<span class="w-4 h-4 sm:w-5 sm:h-5 inline-block -mr-1 piece-svg">${PIECE_SVGS[bottomColor + t.toUpperCase()]}</span>`
        ).join('');

        this.bottomCapturedEl.innerHTML = bottomCapturedList.map(t => 
            `<span class="w-4 h-4 sm:w-5 sm:h-5 inline-block -mr-1 piece-svg">${PIECE_SVGS[topColor + t.toUpperCase()]}</span>`
        ).join('');

        // Vantagem de pontos
        const values = { p: 1, n: 3, b: 3, r: 5, q: 9 };
        let whitePoints = 0;
        let blackPoints = 0;

        capturedBlack.forEach(t => whitePoints += values[t]);
        capturedWhite.forEach(t => blackPoints += values[t]);

        const bottomDiff = (bottomColor === 'w') ? (whitePoints - blackPoints) : (blackPoints - whitePoints);
        if (bottomDiff > 0) {
            this.bottomAdvantageEl.innerText = `+${bottomDiff}`;
            this.bottomAdvantageEl.classList.remove('hidden');
            this.topAdvantageEl.classList.add('hidden');
        } else if (bottomDiff < 0) {
            this.topAdvantageEl.innerText = `+${Math.abs(bottomDiff)}`;
            this.topAdvantageEl.classList.remove('hidden');
            this.bottomAdvantageEl.classList.add('hidden');
        } else {
            this.bottomAdvantageEl.classList.add('hidden');
            this.topAdvantageEl.classList.add('hidden');
        }
    }

    // --- HISTÓRICO DE LANCES ---
    updateMoveHistory() {
        const history = this.game.history();
        this.historyListEl.innerHTML = '';

        for (let i = 0; i < history.length; i += 2) {
            const moveNum = Math.floor(i / 2) + 1;
            const whiteMove = history[i];
            const blackMove = history[i + 1] || '';

            const row = document.createElement('div');
            row.className = 'grid grid-cols-12 py-1 px-2 text-xs sm:text-sm hover:bg-gray-100 dark:hover:bg-gray-800 rounded';
            row.innerHTML = `
                <span class="col-span-3 text-gray-400 font-mono">${moveNum}.</span>
                <span class="col-span-4 font-semibold text-gray-800 dark:text-gray-200">${whiteMove}</span>
                <span class="col-span-5 font-semibold text-gray-800 dark:text-gray-200">${blackMove}</span>
            `;
            this.historyListEl.appendChild(row);
        }

        this.historyListEl.scrollTop = this.historyListEl.scrollHeight;
    }

    // --- RELÓGIOS ---
    initClocks() {
        this.stopClocks();
        if (this.timeControl > 0) {
            this.whiteTime = this.timeControl;
            this.blackTime = this.timeControl;
            this.topClockEl.classList.remove('hidden');
            this.bottomClockEl.classList.remove('hidden');
            this.renderClockTimes();
            this.startClocks();
        } else {
            this.topClockEl.classList.add('hidden');
            this.bottomClockEl.classList.add('hidden');
        }
    }

    startClocks() {
        this.stopClocks();
        this.clockTimer = setInterval(() => {
            if (this.game.game_over() || (this.isOnline && this.roomStatus !== 'playing')) return;

            if (this.game.turn() === 'w') {
                this.whiteTime = Math.max(0, this.whiteTime - 1);
                if (this.whiteTime === 0) {
                    this.handleTimeout('w');
                }
            } else {
                this.blackTime = Math.max(0, this.blackTime - 1);
                if (this.blackTime === 0) {
                    this.handleTimeout('b');
                }
            }
            this.renderClockTimes();
        }, 1000);
    }

    stopClocks() {
        if (this.clockTimer) {
            clearInterval(this.clockTimer);
            this.clockTimer = null;
        }
    }

    renderClockTimes() {
        const formatTime = (secs) => {
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            return `${m}:${s < 10 ? '0' : ''}${s}`;
        };

        const topColor = this.boardFlipped ? 'w' : 'b';
        const topTime = topColor === 'w' ? this.whiteTime : this.blackTime;
        const bottomTime = topColor === 'w' ? this.blackTime : this.whiteTime;

        this.topClockEl.innerText = formatTime(topTime);
        this.bottomClockEl.innerText = formatTime(bottomTime);

        if (topTime < 30) this.topClockEl.classList.add('text-red-500');
        else this.topClockEl.classList.remove('text-red-500');

        if (bottomTime < 30) this.bottomClockEl.classList.add('text-red-500');
        else this.bottomClockEl.classList.remove('text-red-500');
    }

    handleTimeout(loserColor) {
        this.stopClocks();
        const winner = loserColor === 'w' ? 'Pretas' : 'Brancas';
        this.statusTextEl.innerHTML = `⏱️ <b>Tempo esgotado!</b> Vitória das ${winner}!`;
        window.chessAudio.playGameEnd(loserColor !== this.myColor);
        if (this.isOnline) {
            this.roomStatus = 'finished';
        }
    }

    // --- MODO ONLINE: CRIAÇÃO E CONEXÃO ---
    showOnlineSetup() {
        this.onlineSetupEl.classList.remove('hidden');
        this.onlineLobbyEl.classList.add('hidden');
        this.onlineActiveEl.classList.add('hidden');
    }

    showOnlineLobby() {
        this.onlineSetupEl.classList.add('hidden');
        this.onlineLobbyEl.classList.remove('hidden');
        this.onlineActiveEl.classList.add('hidden');
    }

    showOnlineActive() {
        this.onlineSetupEl.classList.add('hidden');
        this.onlineLobbyEl.classList.add('hidden');
        this.onlineActiveEl.classList.remove('hidden');
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async createOnlineRoom() {
        this.onlineEngine = this.onlineEngineSelect.value;
        this.timeControl = parseInt(this.onlineTimeSelect.value, 10);
        const colorPref = this.onlineColorSelect.value;
        this.roomCode = this.generateRoomCode();
        this.isHost = true;

        if (colorPref === 'random') {
            this.myColor = Math.random() < 0.5 ? 'w' : 'b';
        } else {
            this.myColor = colorPref;
        }

        this.roomCodeDisplayEl.innerText = this.roomCode;
        this.showOnlineLobby();
        this.roomStatus = 'waiting';
        this.newGame();

        if (this.onlineEngine === 'p2p') {
            this.initPeerHost();
        } else {
            this.initServerHost();
        }
    }

    async joinOnlineRoom() {
        const code = this.roomCodeInput.value.trim().toUpperCase();
        if (!code) {
            this.showToast('Digite o código da sala!');
            return;
        }

        this.roomCode = code;
        this.onlineEngine = this.onlineEngineSelect.value;
        this.isHost = false;

        this.showToast(`Conectando à sala ${code}...`);

        if (this.onlineEngine === 'p2p') {
            this.initPeerGuest();
        } else {
            this.initServerGuest();
        }
    }

    // --- CONEXÃO P2P (PEERJS) ---
    initPeerHost() {
        const peerId = `xadrez-room-${this.roomCode.toLowerCase()}`;
        if (this.peer) this.peer.destroy();

        try {
            this.peer = new Peer(peerId);
        } catch (e) {
            console.error('Erro ao instanciar PeerJS:', e);
            this.showToast('Erro ao criar sala P2P. Tente com Servidor Local.');
            return;
        }

        this.peer.on('open', (id) => {
            console.log('Host P2P ativo com ID:', id);
            this.showToast('Sala criada! Aguardando oponente...');
        });

        this.peer.on('connection', (conn) => {
            console.log('Oponente conectou-se ao Host!');
            this.conn = conn;
            this.setupP2PConnection();

            this.conn.on('open', () => {
                // Host envia os parâmetros da partida para o Guest
                const guestColor = (this.myColor === 'w') ? 'b' : 'w';
                this.conn.send({
                    type: 'handshake',
                    guestColor: guestColor,
                    timeControl: this.timeControl,
                    fen: this.game.fen()
                });

                this.onOnlineGameStart();
            });
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS Host Error:', err);
            if (err.type === 'unavailable-id') {
                this.showToast('Código já em uso! Gerando novo código...');
                this.createOnlineRoom();
            } else {
                this.showToast('Erro de conexão P2P: ' + err.type);
            }
        });
    }

    initPeerGuest() {
        if (this.peer) this.peer.destroy();

        try {
            this.peer = new Peer(); // Guest recebe um Peer ID aleatório
        } catch (e) {
            console.error('Erro ao instanciar PeerJS Guest:', e);
            this.showToast('Erro de conexão P2P.');
            return;
        }

        this.peer.on('open', () => {
            const hostPeerId = `xadrez-room-${this.roomCode.toLowerCase()}`;
            this.conn = this.peer.connect(hostPeerId, { reliable: true });
            this.setupP2PConnection();

            this.conn.on('open', () => {
                this.showToast('Conectado à sala! Aguardando o Host...');
            });
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS Guest Error:', err);
            this.showToast('Não foi possível conectar à sala. Verifique o código.');
        });
    }

    setupP2PConnection() {
        if (!this.conn) return;

        this.conn.on('data', (data) => {
            this.handleIncomingMessage(data);
        });

        this.conn.on('close', () => {
            this.showToast('⚠️ Oponente desconectou-se da partida.');
            this.roomStatus = 'idle';
            this.updateStatus();
        });

        this.conn.on('error', (err) => {
            console.error('Erro na conexão de dados:', err);
        });
    }

    // --- CONEXÃO COM SERVIDOR LOCAL (PYTHON API) ---
    async initServerHost() {
        try {
            const res = await fetch('/api/rooms/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: this.roomCode,
                    color: this.myColor,
                    time_control: this.timeControl
                })
            });
            const data = await res.json();
            if (data.ok) {
                this.startServerPolling();
            } else {
                this.showToast(data.error || 'Erro ao criar sala no servidor.');
            }
        } catch (e) {
            console.error('Erro no servidor local:', e);
            this.showToast('Servidor local não encontrado! Iniciando via P2P...');
            this.onlineEngineSelect.value = 'p2p';
            this.onlineEngine = 'p2p';
            this.initPeerHost();
        }
    }

    async initServerGuest() {
        try {
            const res = await fetch('/api/rooms/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: this.roomCode })
            });
            const data = await res.json();
            if (data.ok) {
                this.myColor = data.myColor;
                this.timeControl = data.timeControl;
                this.onOnlineGameStart();
                this.startServerPolling();
            } else {
                this.showToast(data.error || 'Sala não encontrada!');
            }
        } catch (e) {
            console.error('Erro no servidor local:', e);
            this.showToast('Erro ao contatar servidor local.');
        }
    }

    startServerPolling() {
        if (this.serverPollInterval) clearInterval(this.serverPollInterval);

        this.serverPollInterval = setInterval(async () => {
            if (!this.isOnline || !this.roomCode) return;
            try {
                const res = await fetch(`/api/rooms/status?code=${this.roomCode}&since_move=${this.lastMoveCount}&since_chat=${this.lastChatId}`);
                if (!res.ok) return;
                const data = await res.json();

                if (!data.exists) return;

                // Se o status mudou para jogando (guest entrou)
                if (this.roomStatus === 'waiting' && data.status === 'playing') {
                    this.onOnlineGameStart();
                }

                // Novos lances
                if (data.newMoves && data.newMoves.length > 0) {
                    data.newMoves.forEach(mv => {
                        this.game.move(mv);
                        this.lastMove = { from: mv.from, to: mv.to };
                        if (mv.captured) window.chessAudio.playCapture();
                        else window.chessAudio.playMove();
                    });
                    this.lastMoveCount = data.totalMoves - 1;
                    this.updateMoveHistory();
                    this.updateCapturedPieces();
                    this.renderBoard();
                    this.updateStatus();
                }

                // Novos chats
                if (data.newChat && data.newChat.length > 0) {
                    data.newChat.forEach(msg => {
                        this.lastChatId = msg.id;
                        if (msg.emoji) this.showReaction(msg.emoji, false);
                        if (msg.text) this.showToast(`${msg.sender}: ${msg.text}`);
                    });
                }

                // Ações especiais
                if (data.drawOffer && data.drawOffer !== this.myColor) {
                    this.showDrawOfferModal();
                }

                if (data.status === 'finished') {
                    if (data.winner === 'draw') {
                        this.statusTextEl.innerHTML = `🤝 Empate aceito!`;
                    } else if (data.endReason && data.endReason.includes('Desistência')) {
                        this.handleResign(data.winner === 'w' ? 'b' : 'w');
                    }
                }

                if (data.rematchRequest === 'accepted') {
                    this.showToast('Revanche aceita! Iniciando nova partida...');
                    this.myColor = (this.myColor === 'w') ? 'b' : 'w';
                    this.newGame();
                }
            } catch (e) {
                // Silencioso em caso de micro falha na rede
            }
        }, 500);
    }

    onOnlineGameStart() {
        this.roomStatus = 'playing';
        this.showOnlineActive();
        const indicator = document.getElementById('active-room-indicator');
        if (indicator) indicator.innerText = `Sala: ${this.roomCode}`;
        this.boardFlipped = (this.myColor === 'b');
        this.newGame();
        window.chessAudio.playNotify();
        this.showToast(`Partida iniciada! Você joga de ${this.myColor === 'w' ? 'Brancas' : 'Pretas'}.`);
    }

    // --- MENSAGENS E SINCRONIZAÇÃO ONLINE ---
    sendMove(moveObj) {
        if (!this.isOnline) return;

        if (this.onlineEngine === 'p2p' && this.conn) {
            this.conn.send({
                type: 'move',
                move: {
                    from: moveObj.from,
                    to: moveObj.to,
                    promotion: moveObj.promotion
                },
                fen: this.game.fen(),
                whiteTime: this.whiteTime,
                blackTime: this.blackTime
            });
        } else if (this.onlineEngine === 'server') {
            fetch('/api/rooms/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: this.roomCode,
                    move: {
                        from: moveObj.from,
                        to: moveObj.to,
                        promotion: moveObj.promotion,
                        san: moveObj.san,
                        captured: moveObj.captured
                    },
                    fen: this.game.fen(),
                    white_time: this.whiteTime,
                    black_time: this.blackTime,
                    game_over: this.game.game_over(),
                    winner: this.game.in_checkmate() ? (this.game.turn() === 'w' ? 'b' : 'w') : null,
                    end_reason: this.game.in_checkmate() ? 'Xeque-mate' : null
                })
            }).catch(e => console.error(e));
        }
    }

    sendChat(text, emoji) {
        if (!this.isOnline) return;
        const sender = (this.myColor === 'w') ? 'Brancas' : 'Pretas';

        if (this.onlineEngine === 'p2p' && this.conn) {
            this.conn.send({
                type: 'chat',
                sender: sender,
                text: text,
                emoji: emoji
            });
        } else if (this.onlineEngine === 'server') {
            fetch('/api/rooms/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: this.roomCode,
                    sender: sender,
                    text: text,
                    emoji: emoji
                })
            }).catch(e => console.error(e));
        }
    }

    sendAction(action) {
        if (!this.isOnline) return;

        if (this.onlineEngine === 'p2p' && this.conn) {
            this.conn.send({
                type: 'action',
                action: action,
                color: this.myColor
            });
        } else if (this.onlineEngine === 'server') {
            fetch('/api/rooms/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: this.roomCode,
                    action: action,
                    color: this.myColor
                })
            }).catch(e => console.error(e));
        }
    }

    handleIncomingMessage(data) {
        switch (data.type) {
            case 'handshake':
                this.myColor = data.guestColor;
                this.timeControl = data.timeControl;
                this.onOnlineGameStart();
                break;

            case 'move':
                const moveResult = this.game.move(data.move);
                if (moveResult) {
                    this.lastMove = { from: moveResult.from, to: moveResult.to };
                    if (data.whiteTime) this.whiteTime = data.whiteTime;
                    if (data.blackTime) this.blackTime = data.blackTime;

                    if (moveResult.captured) window.chessAudio.playCapture();
                    else window.chessAudio.playMove();

                    if (this.game.in_check()) {
                        setTimeout(() => window.chessAudio.playCheck(), 120);
                    }

                    this.updateMoveHistory();
                    this.updateCapturedPieces();
                    this.renderBoard();
                    this.updateStatus();

                    if (this.game.game_over()) {
                        this.handleGameOver();
                    }
                }
                break;

            case 'chat':
                if (data.emoji) this.showReaction(data.emoji, false);
                if (data.text) this.showToast(`${data.sender}: ${data.text}`);
                window.chessAudio.playNotify();
                break;

            case 'action':
                if (data.action === 'resign') {
                    this.handleResign(data.color);
                } else if (data.action === 'offer_draw') {
                    this.showDrawOfferModal();
                } else if (data.action === 'accept_draw') {
                    this.showToast('Empate aceito por acordo mútuo!');
                    this.statusTextEl.innerHTML = `🤝 Partida empatada por acordo!`;
                    this.roomStatus = 'finished';
                } else if (data.action === 'request_rematch') {
                    this.showRematchModal();
                } else if (data.action === 'accept_rematch') {
                    this.showToast('Revanche aceita! Trocando cores...');
                    this.myColor = (this.myColor === 'w') ? 'b' : 'w';
                    this.newGame();
                }
                break;
        }
    }

    showDrawOfferModal() {
        if (confirm('O oponente propôs EMPATE. Deseja aceitar?')) {
            this.sendAction('accept_draw');
            this.showToast('Você aceitou o empate.');
            this.statusTextEl.innerHTML = `🤝 Partida empatada por acordo!`;
            this.roomStatus = 'finished';
        } else {
            this.sendAction('decline_draw');
            this.showToast('Você recusou o empate.');
        }
    }

    showRematchModal() {
        if (confirm('O oponente propôs uma REVANCHE! Deseja jogar novamente?')) {
            this.sendAction('accept_rematch');
            this.showToast('Revanche aceita! Iniciando...');
            this.myColor = (this.myColor === 'w') ? 'b' : 'w';
            this.newGame();
        }
    }

    cleanupOnline() {
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        if (this.conn) {
            this.conn.close();
            this.conn = null;
        }
        if (this.serverPollInterval) {
            clearInterval(this.serverPollInterval);
            this.serverPollInterval = null;
        }
        this.roomStatus = 'idle';
        this.roomCode = null;
    }

    // --- UTILITÁRIOS: TOAST, REAÇÕES E CLIPBOARD ---
    showToast(message) {
        if (!this.toastEl) return;
        this.toastEl.innerText = message;
        this.toastEl.classList.remove('opacity-0', 'translate-y-4');
        this.toastEl.classList.add('opacity-100', 'translate-y-0');

        setTimeout(() => {
            this.toastEl.classList.remove('opacity-100', 'translate-y-0');
            this.toastEl.classList.add('opacity-0', 'translate-y-4');
        }, 3000);
    }

    showReaction(emoji, isMine) {
        if (!this.reactionContainer) return;
        const el = document.createElement('div');
        el.className = `text-4xl absolute transition-all duration-1000 transform select-none pointer-events-none ${
            isMine ? 'right-4' : 'left-4'
        } bottom-10`;
        el.innerText = emoji;
        this.reactionContainer.appendChild(el);

        requestAnimationFrame(() => {
            el.style.transform = `translateY(-90px) scale(1.4)`;
            el.style.opacity = '0';
        });

        setTimeout(() => el.remove(), 1050);
    }

    copyToClipboard(text, successMsg) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                this.showToast(successMsg);
            }).catch(() => {
                this.fallbackCopyText(text, successMsg);
            });
        } else {
            this.fallbackCopyText(text, successMsg);
        }
    }

    fallbackCopyText(text, successMsg) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            this.showToast(successMsg);
        } catch (e) {
            prompt('Copie o código manualmente:', text);
        }
        document.body.removeChild(textarea);
    }
}

// Inicia o app quando a página carregar
window.addEventListener('DOMContentLoaded', () => {
    window.chessApp = new ChessApp();
});
