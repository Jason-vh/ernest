FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY funda_core.py fetch_and_push.py ./
CMD ["python", "fetch_and_push.py"]
