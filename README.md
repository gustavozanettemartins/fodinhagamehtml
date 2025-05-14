# Fodinha - Jogo de Cartas Multiplayer

Um jogo de cartas multiplayer onde os jogadores tentam adivinhar quantas rodadas vão ganhar.

## Como Jogar

1. Cada jogador recebe cartas e faz um palpite de quantas rodadas acredita que vai ganhar
2. Na primeira rodada, os jogadores não podem ver suas próprias cartas, apenas as dos outros
3. Os jogadores jogam uma carta por vez em cada rodada
4. Após todas as cartas serem jogadas, os jogadores perdem pontos de vida conforme a diferença entre seu palpite e suas vitórias
5. O último jogador vivo vence

## Instalação

```bash
# Instalar dependências
npm install

# Iniciar o servidor
npm start
```

## Como Conectar

1. Abra o navegador em http://localhost:3000
2. Digite seu nome e opcionalmente um código de sala
3. Compartilhe o código da sala com os amigos para que possam se juntar
4. Clique em "Pronto" quando estiver preparado
5. O jogo começará quando todos os jogadores estiverem prontos

## Tecnologias

- Express.js
- Socket.IO
- HTML5/CSS3
- JavaScript

## Requisitos

- Node.js 14.x ou superior 