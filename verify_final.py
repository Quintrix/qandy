import asyncio
from playwright.async_api import async_playwright
import http.server
import socketserver
import threading
import os

PORT = 8015

def run_server():
    handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        httpd.serve_forever()

async def run_test():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda err: print(f"ERROR: {err}"))

        url = f"http://localhost:{PORT}/qandy-host.htm"
        print(f"Loading {url}...")
        await page.goto(url)

        print("Waiting for guest iframe...")
        await page.wait_for_selector("#vm-iframe", timeout=10000)
        iframe_element = await page.query_selector("#vm-iframe")
        iframe = await iframe_element.content_frame()

        print("Waiting for terminal in guest...")
        await iframe.wait_for_selector("#txt", timeout=10000)

        # Take screenshot
        await page.screenshot(path="/home/jules/verification/screenshots/final.png")
        print("Screenshot saved to final.png")

        # Check text
        content = await iframe.inner_text("#txt")
        print("Guest terminal content:")
        print(content[:200])

        if "Qandy" in content:
            print("SUCCESS: Qandy detected!")
        else:
            print("FAILURE: Qandy NOT detected.")

        await browser.close()

if __name__ == "__main__":
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    asyncio.run(run_test())
