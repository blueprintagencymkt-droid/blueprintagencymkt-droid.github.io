# BluePrint · a planta que se levanta

Site do perfil da BluePrint, publicado em **https://blueprintagencymkt-droid.github.io/**.

Uma folha de projeto em sete etapas: o retângulo áureo da marca vira planta 3D e se constrói conforme a rolagem: Design Thinking, Branding, Arquitetura, Medida e Escala.

- **three.js** (r186) desenha a planta; **GSAP** (3.15) + ScrollTrigger conduzem a construção.
- Movimento conforme o design system: 0,382s / 0,618s / 1s, `power3.inOut` e `expo.out`, sem quiques, elásticos ou rotações; a câmera só se desloca.
- "Reduzir movimento" ativo: a página mostra o quadro final, a planta pronta com as cotas.
- Sem etapa de build: `index.html`, `style.css`, `main.js` e as bibliotecas em `vendor/`.

Para ver localmente: `python3 -m http.server` nesta pasta e abra `http://localhost:8000`.

CURITIBA · PR · [blueprintlabs.space](https://blueprintlabs.space)
