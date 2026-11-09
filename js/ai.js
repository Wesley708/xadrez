/**
 * Motor de Inteligência Artificial para Xadrez.
 * Implementa Minimax com Poda Alfa-Beta, Tabelas de Valor Posicional (PST) e Ordenação de Lances.
 */

class ChessAI {
    constructor() {
        this.PIECE_VALUES = {
            p: 100,
            n: 320,
            b: 330,
            r: 500,
            q: 900,
            k: 20000
        };

        // Tabelas de Valores Posicionais (Perspectiva das Brancas)
        this.PST_PAWN = [
            [  0,   0,   0,   0,   0,   0,   0,   0],
            [ 50,  50,  50,  50,  50,  50,  50,  50],
            [ 10,  10,  20,  30,  30,  20,  10,  10],
            [  5,   5,  10,  25,  25,  10,   5,   5],
            [  0,   0,   0,  20,  20,   0,   0,   0],
            [  5,  -5, -10,   0,   0, -10,  -5,   5],
            [  5,  10,  10, -20, -20,  10,  10,   5],
            [  0,   0,   0,   0,   0,   0,   0,   0]
        ];

        this.PST_KNIGHT = [
            [-50, -40, -30, -30, -30, -30, -40, -50],
            [-40, -20,   0,   0,   0,   0, -20, -40],
            [-30,   0,  10,  15,  15,  10,   0, -30],
            [-30,   5,  15,  20,  20,  15,   5, -30],
            [-30,   0,  15,  20,  20,  15,   0, -30],
            [-30,   5,  10,  15,  15,  10,   5, -30],
            [-40, -20,   0,   5,   5,   0, -20, -40],
            [-50, -40, -30, -30, -30, -30, -40, -50]
        ];

        this.PST_BISHOP = [
            [-20, -10, -10, -10, -10, -10, -10, -20],
            [-10,   0,   0,   0,   0,   0,   0, -10],
            [-10,   0,   5,  10,  10,   5,   0, -10],
            [-10,   5,   5,  10,  10,   5,   5, -10],
            [-10,   0,  10,  10,  10,  10,   0, -10],
            [-10,  10,  10,  10,  10,  10,  10, -10],
            [-10,   5,   0,   0,   0,   0,   5, -10],
            [-20, -10, -10, -10, -10, -10, -10, -20]
        ];

        this.PST_ROOK = [
            [  0,   0,   0,   0,   0,   0,   0,   0],
            [  5,  10,  10,  10,  10,  10,  10,   5],
            [ -5,   0,   0,   0,   0,   0,   0,  -5],
            [ -5,   0,   0,   0,   0,   0,   0,  -5],
            [ -5,   0,   0,   0,   0,   0,   0,  -5],
            [ -5,   0,   0,   0,   0,   0,   0,  -5],
            [ -5,   0,   0,   0,   0,   0,   0,  -5],
            [  0,   0,   0,   5,   5,   0,   0,   0]
        ];

        this.PST_QUEEN = [
            [-20, -10, -10,  -5,  -5, -10, -10, -20],
            [-10,   0,   0,   0,   0,   0,   0, -10],
            [-10,   0,   5,   5,   5,   5,   0, -10],
            [ -5,   0,   5,   5,   5,   5,   0,  -5],
            [  0,   0,   5,   5,   5,   5,   0,  -5],
            [-10,   5,   5,   5,   5,   5,   0, -10],
            [-10,   0,   5,   0,   0,   0,   0, -10],
            [-20, -10, -10,  -5,  -5, -10, -10, -20]
        ];

        this.PST_KING_MID = [
            [-30, -40, -40, -50, -50, -40, -40, -30],
            [-30, -40, -40, -50, -50, -40, -40, -30],
            [-30, -40, -40, -50, -50, -40, -40, -30],
            [-30, -40, -40, -50, -50, -40, -40, -30],
            [-20, -30, -30, -40, -40, -30, -30, -20],
            [-10, -20, -20, -20, -20, -20, -20, -10],
            [ 20,  20,   0,   0,   0,   0,  20,  20],
            [ 20,  30,  10,   0,   0,  10,  30,  20]
        ];
    }

    getPieceSquareValue(piece, r, c) {
        let pst;
        switch (piece.type) {
            case 'p': pst = this.PST_PAWN; break;
            case 'n': pst = this.PST_KNIGHT; break;
            case 'b': pst = this.PST_BISHOP; break;
            case 'r': pst = this.PST_ROOK; break;
            case 'q': pst = this.PST_QUEEN; break;
            case 'k': pst = this.PST_KING_MID; break;
            default: return 0;
        }

        // Se for branca, lê a tabela direta. Se for preta, inverte verticalmente (7 - r)
        return piece.color === 'w' ? pst[r][c] : pst[7 - r][c];
    }

    evaluateBoard(game) {
        if (game.in_checkmate()) {
            return game.turn() === 'w' ? -999999 : 999999;
        }
        if (game.in_draw() || game.in_stalemate() || game.in_threefold_repetition()) {
            return 0;
        }

        let evaluation = 0;
        const board = game.board();

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece) {
                    const material = this.PIECE_VALUES[piece.type];
                    const positional = this.getPieceSquareValue(piece, r, c);
                    const totalVal = material + positional;
                    evaluation += (piece.color === 'w') ? totalVal : -totalVal;
                }
            }
        }
        return evaluation;
    }

    orderMoves(game, moves) {
        // Ordena movimentos para otimizar podas alfa-beta (capturas de peças de maior valor primeiro)
        return moves.sort((a, b) => {
            let scoreA = 0;
            let scoreB = 0;

            if (a.captured) {
                scoreA = 10 * this.PIECE_VALUES[a.captured] - this.PIECE_VALUES[a.piece];
            }
            if (a.promotion) {
                scoreA += 800;
            }

            if (b.captured) {
                scoreB = 10 * this.PIECE_VALUES[b.captured] - this.PIECE_VALUES[b.piece];
            }
            if (b.promotion) {
                scoreB += 800;
            }

            return scoreB - scoreA;
        });
    }

    minimax(game, depth, alpha, beta, isMaximizing) {
        if (depth === 0 || game.game_over()) {
            return this.evaluateBoard(game);
        }

        const rawMoves = game.moves({ verbose: true });
        const moves = this.orderMoves(game, rawMoves);

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (let i = 0; i < moves.length; i++) {
                game.move(moves[i]);
                const evaluation = this.minimax(game, depth - 1, alpha, beta, false);
                game.undo();
                maxEval = Math.max(maxEval, evaluation);
                alpha = Math.max(alpha, evaluation);
                if (beta <= alpha) break; // Poda Beta
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (let i = 0; i < moves.length; i++) {
                game.move(moves[i]);
                const evaluation = this.minimax(game, depth - 1, alpha, beta, true);
                game.undo();
                minEval = Math.min(minEval, evaluation);
                beta = Math.min(beta, evaluation);
                if (beta <= alpha) break; // Poda Alfa
            }
            return minEval;
        }
    }

    getBestMove(game, depth, isBlack) {
        const rawMoves = game.moves({ verbose: true });
        if (rawMoves.length === 0) return null;

        // Embaralha para que movimentos de mesmo valor não sejam repetitivos
        rawMoves.sort(() => Math.random() - 0.5);
        const moves = this.orderMoves(game, rawMoves);

        let bestMove = null;

        if (isBlack) {
            let bestVal = Infinity;
            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];
                game.move(move);
                // Próximo turno é das brancas (isMaximizing = true)
                const boardVal = this.minimax(game, depth - 1, -Infinity, Infinity, true);
                game.undo();

                if (boardVal < bestVal) {
                    bestVal = boardVal;
                    bestMove = move;
                }
            }
        } else {
            let bestVal = -Infinity;
            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];
                game.move(move);
                // Próximo turno é das pretas (isMaximizing = false)
                const boardVal = this.minimax(game, depth - 1, -Infinity, Infinity, false);
                game.undo();

                if (boardVal > bestVal) {
                    bestVal = boardVal;
                    bestMove = move;
                }
            }
        }

        return bestMove || moves[0];
    }

    calculateMove(game, difficulty = 'medium') {
        const moves = game.moves({ verbose: true });
        if (moves.length === 0) return null;

        const isBlack = (game.turn() === 'b');

        if (difficulty === 'easy') {
            // No modo fácil: 60% chance de lance aleatório, 40% chance de capturar peça solta se houver
            const captures = moves.filter(m => m.captured);
            if (captures.length > 0 && Math.random() < 0.4) {
                return captures[Math.floor(Math.random() * captures.length)];
            }
            return moves[Math.floor(Math.random() * moves.length)];
        } else if (difficulty === 'medium') {
            // Profundidade 2 + Tabelas Posicionais
            return this.getBestMove(game, 2, isBlack);
        } else {
            // Difícil: Profundidade 3 + Tabelas Posicionais + Poda Alfa-Beta refinada
            return this.getBestMove(game, 3, isBlack);
        }
    }
}

window.chessAI = new ChessAI();
