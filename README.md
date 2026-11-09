# ♟️ Xadrez Completo no Navegador (com Modo Online)

Jogo de xadrez moderno, responsivo e completo feito para rodar direto no navegador. Suporta partidas multiplayer online via **Internet P2P (WebRTC)** ou **Rede Local (Wi-Fi)**, além de modos contra Inteligência Artificial e modo local na mesma tela.

---

## 🚀 Como Iniciar

Abra o terminal na pasta do projeto e execute:

```bash
python3 server.py
```

Em seguida, abra no seu navegador:
👉 **[http://localhost:8000](http://localhost:8000)**

> 📱 **Quer jogar no celular ou com alguém no mesmo Wi-Fi?**  
> O terminal exibirá o endereço da sua rede local (ex: `http://192.168.18.126:8000`). Basta abrir esse link no navegador do celular!

---

## 🌐 Modos de Jogo

### 1. Modo Online (Multiplayer)
- **Criar Sala**: Escolha seu controle de tempo (Sem tempo, 3 min Blitz, 5 min Rápido ou 10 min) e a sua cor (Brancas, Pretas ou Sorteio).
- **Convite com 1 Clique**: Clique em **"Copiar Link"** e envie para seu amigo pelo WhatsApp, Discord, etc.
- **Entrar em Sala**: O seu amigo só precisa colar o link ou digitar o código de 5 letras da sala (ex: `K9W3R`) e clicar em **"Entrar"**.
- **Tipos de Conexão**:
  - **Internet P2P (PeerJS / WebRTC)**: Conexão direta entre os navegadores via WebRTC com latência mínima. Funciona com amigos em qualquer lugar do mundo sem precisar abrir portas no roteador.
  - **Servidor Local**: Ideal para jogar na mesma rede Wi-Fi / LAN ou sem conexão com a internet.
- **Recursos da Partida Online**:
  - Chat rápido e reações com emojis (👏, 🔥, 😮, 🤔, 🤝, ⏳, 👍).
  - Proposta de empate e desistência.
  - Pedido de revanche com alternância automática de cores.

### 2. Contra o Computador (IA)
- **Fácil**: Ideal para iniciantes, com lances casuais e erros humanos naturais.
- **Médio**: Algoritmo Minimax com avaliação posicional das peças.
- **Difícil**: Minimax aprofundado com poda alfa-beta, tabelas de valores posicionais (Piece-Square Tables) e ordenação tática de lances.

### 3. Modo Local (Mesma Tela)
- Dois jogadores compartilham a mesma tela/teclado/celular (Pass & Play).
- Botão de **Inverter Tabuleiro** e botão de **Desfazer Lance** inclusos.

---

## 🎨 Destaques e Recursos

- 🏆 **Regras Oficiais FIDE (via chess.js)**: Roque pequeno e grande, captura *en passant*, promoção de peão (modal com Dama, Torre, Bispo e Cavalo), xeque, xeque-mate, afogamento, empate por repetição e regra dos 50 lances.
- 🎨 **Peças Vetoriais SVG de Alta Resolução**: Gráficos nítidos em qualquer resolução de tela (padrão mundial Lichess / Colin Burnett).
- 🔊 **Efeitos Sonoros Realistas (Web Audio API)**: Sons de movimento de peça, captura, xeque, roque e vitória sintetizados direto no navegador (sem arquivos pesados para baixar e 100% offline).
- 🖱️ **Drag & Drop e Clique-para-Mover**: Arraste a peça ou simplesmente clique nela para ver os destinos legais.
- ⏱️ **Relógios e Vantagem Material**: Contagem de peças capturadas para ambos os lados e cálculo em tempo real da vantagem numérica (+1, +3, +5...).
- 🌙 **Modo Escuro / Claro**: Suporte automático à preferência do sistema e botão manual para alternar temas.
