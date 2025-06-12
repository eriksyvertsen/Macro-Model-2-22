
#!/usr/bin/env python3
import subprocess
import threading
import time
import os

def start_backend():
    """Start the Python backend server"""
    print("Starting Python backend on port 8050...")
    subprocess.run(["python", "main.py"])

def start_frontend():
    """Start the React frontend server"""
    print("Starting React frontend on port 3000...")
    os.chdir("frontend")
    subprocess.run(["npm", "start"])

if __name__ == "__main__":
    # Start backend in a thread
    backend_thread = threading.Thread(target=start_backend, daemon=True)
    backend_thread.start()
    
    # Give backend a moment to start
    time.sleep(3)
    
    # Start frontend (this will block)
    start_frontend()
