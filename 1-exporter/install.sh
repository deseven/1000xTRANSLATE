#!/bin/bash

uv venv --python 3.9
source .venv/bin/activate
uv pip install python-dotenv UnityPy==1.20.18