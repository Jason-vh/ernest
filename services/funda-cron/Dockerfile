FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN addgroup --system appgroup && adduser --system --ingroup appgroup --no-create-home appuser
COPY funda_core.py fetch_and_push.py ./
USER appuser
CMD ["python", "fetch_and_push.py"]
