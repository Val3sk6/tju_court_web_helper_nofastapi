# -*- coding: utf-8 -*-
import threading
import time
import webbrowser
from server import run

if __name__ == "__main__":
    threading.Thread(target=lambda: (time.sleep(1), webbrowser.open("http://127.0.0.1:8787")), daemon=True).start()
    run()
