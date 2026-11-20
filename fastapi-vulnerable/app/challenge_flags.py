"""The site stays common; only the selected challenge may expose its fixed flag."""
import os


def flag_for(challenge, variable, fallback=''):
    active = os.getenv('PNP_CHALLENGE_ID', '')
    if active:
        return os.getenv(variable, '') if active == challenge else ''
    return os.getenv(variable) or fallback  # Keep the legacy shared lab behavior.
