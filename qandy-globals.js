#cursor { background-color: #CCC; }
.qpc { position: absolute; top: 0px; left: 0px; width: 160px; height: 24px;
       padding-left: 0px; padding-right: 0px; align-items: center;
       backgroudo itnd-color: grey; z-index: 0; }
.txt {
  position: absolute;
  left: 54px;
  top: 64px;
  width: 256px;
  height: 384px;
  z-index: 250;
  font-family: 'Courier New', Courier, 'Consolas', 'DejaVu Sans Mono', 'Liberation Mono', 'Menlo', Monaco, monospace;
  font-size: 12px;
  font-weight: normal;
  color: #fff;
  background-color: #000;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
  line-height: 1.2;
  box-sizing: border-box;
  white-space: pre;
  word-wrap: break-word;
  display: block;
  scrollbar-width: thin;
  scrollbar-color: #0f0 #000;
}

.txt::-webkit-scrollbar { width: 12px; }
.txt::-webkit-scrollbar-track { background: #000; border-left: 1px solid #222; }
.txt::-webkit-scrollbar-thumb { background: #0f0; border-radius: 6px; border: 2px solid #000; }
.txt::-webkit-scrollbar-thumb:hover { background: #0f0; box-shadow: inset 0 0 6px rgba(0, 255, 0, 0.3); }
.txt::-webkit-scrollbar-thumb:active { background: #0f0; }

#cursor {
  display: inline-block;
  background-color: #fff;
  width: 8px;
  height: 14px;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.ansi-black { color: #000; }
.ansi-red { color: #f00; }
.ansi-green { color: #0f0; }
.ansi-yellow { color: #ff0; }
.ansi-blue { color: #00f; }
.ansi-magenta { color: #f0f; }
.ansi-cyan { color: #0ff; }
.ansi-white { color: #fff; }

.ansi-bg-black { background-color: #000; }
.ansi-bg-red { background-color: #f00; }
.ansi-bg-green { background-color: #0f0; }
.ansi-bg-yellow { background-color: #ff0; }
.ansi-bg-blue { background-color: #00f; }
.ansi-bg-magenta { background-color: #f0f; }
.ansi-bg-cyan { background-color: #0ff; }
.ansi-bg-white { background-color: #fff; }

.ansi-bold { font-weight: bold; }
.ansi-inverse {
  background-color: #fff !important;
  color: #000 !important;
  filter: none !important;
}

@keyframes qandy-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.qandy-cursor {
  display: inline-block;
  background-color: #fff;
  color: #000;
  animation: qandy-blink 1s steps(1, start) infinite;
}

:root {
  --cols: 32;               /* columns */
  --cell-w: 13px;
  --cell-h: 15px;
  --cell-fs: 13px;
}

#screen {
  display: grid;
  grid-template-columns: repeat(var(--cols), var(--cell-w));
  grid-auto-rows: var(--cell-h);
  font-family: monospace, monospace;
  font-size: var(--cell-fs);
  line-height: var(--cell-h);
  -webkit-font-smoothing: antialiased;
}

/* Each cell is a grid item; set background per cell without seams */
.cell {
  width: var(--cell-w);
  height: var(--cell-h);
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Make rows own the background and ensure cells are exact-size and transparent when desired */
.qandy-row {
  display: flex;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  height: var(--cell-h);
  line-height: var(--cell-h);
  align-items: center;
  gap: 0;
  background-color: transparent; /* default: transparent, mode can override */
}

/* Ensure cells are exact-pixel sized and don't introduce borders/gaps */
.qandy-cell {
  width: var(--cell-w);
  height: var(--cell-h);
  font-size: var(--cell-fs);
  line-height: var(--cell-h);
  padding: 0;
  margin: 0;
  border: 0;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent; /* default transparent so row owns bg if needed */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transform: translateZ(0); /* force compositing layer (helps some UA rendering) */
}

/* Sysop mode: make each row the visible background and keep cells transparent */
#txt.sysop .qandy-row,
#screen.sysop .qandy-row {
  background-color: #0b2340 !important; /* choose your distinctive sysop color */
}

#txt.sysop .qandy-cell,
#screen.sysop .qandy-cell {
  background: transparent !important;
  color: #ffffff !important; /* ensure legible text on sysop bg */
}
