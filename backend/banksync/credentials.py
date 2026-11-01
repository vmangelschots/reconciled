"""Each household's Enable Banking key, encrypted with
HOUSEHOLD_ENCRYPTION_KEYS: the first key writes, all of them read, so a key can
be rotated (`manage.py rotate_encryption_key`)."""

from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from django.conf import settings


class NoEncryptionKey(Exception):
    """The server has no usable encryption key."""


def _fernet():
    if not settings.HOUSEHOLD_ENCRYPTION_KEYS:
        raise NoEncryptionKey()
    try:
        return MultiFernet([Fernet(key) for key in settings.HOUSEHOLD_ENCRYPTION_KEYS])
    except ValueError:
        raise NoEncryptionKey() from None


def encrypt(text):
    return _fernet().encrypt(text.encode()).decode()


def decrypt(token):
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        raise NoEncryptionKey() from None


def rotate(token):
    return _fernet().rotate(token.encode()).decode()


def is_private_key(text):
    """Whether text is an unencrypted RSA private key, which is what signing
    Enable Banking's tokens needs."""
    try:
        key = load_pem_private_key(str(text).encode(), password=None)
    except (ValueError, TypeError, UnsupportedAlgorithm):
        return False
    return isinstance(key, RSAPrivateKey)
