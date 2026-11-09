#!/usr/bin/env python3
"""
Servidor HTTP e API de Salas para o Jogo de Xadrez Online.
Compatível com Python 3 padrão (sem dependências externas).
"""

import sys
import os
import json
import time
import socket
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Armazenamento em memória das salas ativas
rooms_lock = threading.Lock()
rooms = {}

def get_local_ip():
    """Detecta o IP na rede local (Wi-Fi / Ethernet)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def cleanup_inactive_rooms():
    """Remove salas inativas há mais de 3 horas."""
    with rooms_lock:
        now = time.time()
        to_delete = [
            code for code, r in rooms.items()
            if now - r.get("last_active", 0) > 10800
        ]
        for code in to_delete:
            del rooms[code]

class ChessRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        # Desativa logs contínuos de polling para manter o terminal limpo
        if "GET /api/rooms/status" in (args[0] if args else ""):
            return
        super().log_message(format, *args)

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        url = urlparse(self.path)
        path = url.path

        if path.startswith("/api/"):
            content_length = int(self.headers.get("Content-Length", 0))
            post_body = self.rfile.read(content_length)
            try:
                data = json.loads(post_body.decode("utf-8")) if post_body else {}
            except Exception:
                data = {}

            if path == "/api/rooms/create":
                self.handle_create_room(data)
                return
            elif path == "/api/rooms/join":
                self.handle_join_room(data)
                return
            elif path == "/api/rooms/move":
                self.handle_move(data)
                return
            elif path == "/api/rooms/chat":
                self.handle_chat(data)
                return
            elif path == "/api/rooms/action":
                self.handle_action(data)
                return
            else:
                self.send_json({"error": "Endpoint não encontrado"}, 404)
                return

        super().do_POST()

    def do_GET(self):
        url = urlparse(self.path)
        path = url.path

        if path == "/api/health":
            self.send_json({"status": "ok", "time": time.time()})
            return

        if path == "/api/rooms/status":
            query = parse_qs(url.query)
            code = query.get("code", [""])[0].upper()
            since_move = int(query.get("since_move", [-1])[0])
            since_chat = int(query.get("since_chat", [-1])[0])
            self.handle_room_status(code, since_move, since_chat)
            return

        super().do_GET()

    def handle_create_room(self, data):
        cleanup_inactive_rooms()
        code = data.get("code", "").strip().upper()
        if not code or len(code) > 10:
            import random, string
            code = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))

        color_pref = data.get("color", "w") # 'w', 'b', ou 'random'
        if color_pref == "random":
            import random
            host_color = random.choice(["w", "b"])
        else:
            host_color = color_pref if color_pref in ["w", "b"] else "w"

        time_control = int(data.get("time_control", 0)) # segundos (0 = sem tempo)

        with rooms_lock:
            rooms[code] = {
                "code": code,
                "created_at": time.time(),
                "last_active": time.time(),
                "host_color": host_color,
                "guest_color": "b" if host_color == "w" else "w",
                "time_control": time_control,
                "white_time": time_control,
                "black_time": time_control,
                "last_move_time": time.time(),
                "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                "moves": [],
                "turn": "w",
                "status": "waiting", # waiting, playing, finished
                "winner": None,
                "end_reason": None,
                "chat": [],
                "draw_offer": None,
                "rematch_request": None,
                "player_count": 1
            }

        self.send_json({
            "ok": True,
            "code": code,
            "myColor": host_color,
            "timeControl": time_control
        })

    def handle_join_room(self, data):
        cleanup_inactive_rooms()
        code = data.get("code", "").strip().upper()
        with rooms_lock:
            if code not in rooms:
                self.send_json({"error": "Sala não encontrada! Verifique o código."}, 404)
                return

            room = rooms[code]
            room["last_active"] = time.time()

            if room["status"] == "waiting":
                room["status"] = "playing"
                room["player_count"] = 2
                room["last_move_time"] = time.time()
                guest_color = room["guest_color"]
            else:
                # Reconexão
                guest_color = room["guest_color"]

        self.send_json({
            "ok": True,
            "code": code,
            "myColor": guest_color,
            "fen": room["fen"],
            "status": room["status"],
            "timeControl": room["time_control"],
            "whiteTime": room["white_time"],
            "blackTime": room["black_time"],
            "moves": room["moves"]
        })

    def handle_move(self, data):
        code = data.get("code", "").strip().upper()
        move_obj = data.get("move")
        fen = data.get("fen")
        white_time = data.get("white_time")
        black_time = data.get("black_time")

        with rooms_lock:
            if code not in rooms:
                self.send_json({"error": "Sala inexistente"}, 404)
                return

            room = rooms[code]
            room["last_active"] = time.time()
            room["last_move_time"] = time.time()

            if fen:
                room["fen"] = fen
            if white_time is not None:
                room["white_time"] = white_time
            if black_time is not None:
                room["black_time"] = black_time

            if move_obj:
                room["moves"].append(move_obj)
                # Alterna o turno
                room["turn"] = "b" if room["turn"] == "w" else "w"

            # Se veio informação de fim de jogo
            if data.get("game_over"):
                room["status"] = "finished"
                room["winner"] = data.get("winner")
                room["end_reason"] = data.get("end_reason")

        self.send_json({"ok": True, "moveCount": len(room["moves"])})

    def handle_chat(self, data):
        code = data.get("code", "").strip().upper()
        sender = data.get("sender", "Anônimo")
        text = data.get("text", "")
        emoji = data.get("emoji", "")

        with rooms_lock:
            if code not in rooms:
                self.send_json({"error": "Sala inexistente"}, 404)
                return

            room = rooms[code]
            room["last_active"] = time.time()
            msg = {
                "id": len(room["chat"]),
                "sender": sender,
                "text": text,
                "emoji": emoji,
                "time": time.time()
            }
            room["chat"].append(msg)

        self.send_json({"ok": True, "chatId": msg["id"]})

    def handle_action(self, data):
        code = data.get("code", "").strip().upper()
        action = data.get("action")
        player_color = data.get("color")

        with rooms_lock:
            if code not in rooms:
                self.send_json({"error": "Sala inexistente"}, 404)
                return

            room = rooms[code]
            room["last_active"] = time.time()

            if action == "resign":
                room["status"] = "finished"
                room["winner"] = "b" if player_color == "w" else "w"
                room["end_reason"] = f"Desistência das {'Brancas' if player_color == 'w' else 'Pretas'}"
            elif action == "offer_draw":
                room["draw_offer"] = player_color
            elif action == "accept_draw":
                room["status"] = "finished"
                room["winner"] = "draw"
                room["end_reason"] = "Empate por acordo mútuo"
                room["draw_offer"] = None
            elif action == "decline_draw":
                room["draw_offer"] = None
            elif action == "request_rematch":
                if room["rematch_request"] and room["rematch_request"] != player_color:
                    # Ambos aceitaram! Reinicia o jogo invertendo as cores
                    old_host = room["host_color"]
                    room["host_color"] = "b" if old_host == "w" else "w"
                    room["guest_color"] = "w" if old_host == "w" else "b"
                    room["fen"] = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                    room["moves"] = []
                    room["turn"] = "w"
                    room["status"] = "playing"
                    room["winner"] = None
                    room["end_reason"] = None
                    room["draw_offer"] = None
                    room["rematch_request"] = "accepted"
                    room["white_time"] = room["time_control"]
                    room["black_time"] = room["time_control"]
                    room["last_move_time"] = time.time()
                else:
                    room["rematch_request"] = player_color

        self.send_json({"ok": True, "action": action})

    def handle_room_status(self, code, since_move, since_chat):
        with rooms_lock:
            if code not in rooms:
                self.send_json({"error": "Sala não encontrada", "exists": False}, 404)
                return

            room = rooms[code]
            room["last_active"] = time.time()

            # Retorna apenas novos movimentos e novos chats para economizar largura de banda
            new_moves = room["moves"][since_move + 1:] if since_move >= 0 else room["moves"]
            new_chat = room["chat"][since_chat + 1:] if since_chat >= 0 else room["chat"]

            res = {
                "exists": True,
                "status": room["status"],
                "fen": room["fen"],
                "turn": room["turn"],
                "winner": room["winner"],
                "endReason": room["end_reason"],
                "drawOffer": room["draw_offer"],
                "rematchRequest": room["rematch_request"],
                "whiteTime": room["white_time"],
                "blackTime": room["black_time"],
                "timeControl": room["time_control"],
                "playerCount": room["player_count"],
                "totalMoves": len(room["moves"]),
                "newMoves": new_moves,
                "newChat": new_chat
            }

        self.send_json(res)

def run():
    local_ip = get_local_ip()
    server_address = ('0.0.0.0', PORT)
    httpd = HTTPServer(server_address, ChessRequestHandler)

    banner = f"""
╔═════════════════════════════════════════════════════════════════════════╗
║                      ♟️   XADREZ ONLINE - NAVEGADOR  ♟️                   ║
╠═════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║  O jogo está rodando e pronto para jogar!                               ║
║                                                                         ║
║  👉 No seu computador:                                                  ║
║     http://localhost:{PORT}                                              ║
║                                                                         ║
║  👉 Em outro aparelho (celular/notebook no mesmo Wi-Fi):                ║
║     http://{local_ip}:{PORT}                                         ║
║                                                                         ║
║  💡 Modos inclusos:                                                     ║
║     • 🌐 Online (Salas multiplayer via Internet / Rede Local)            ║
║     • 🤖 Contra o Computador (Fácil, Médio, Difícil)                    ║
║     • 👥 Local (2 jogadores na mesma tela)                              ║
║                                                                         ║
║  Pressione Ctrl+C para encerrar o servidor.                             ║
╚═════════════════════════════════════════════════════════════════════════╝
"""
    print(banner)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado com sucesso.")
        httpd.server_close()

if __name__ == "__main__":
    run()
