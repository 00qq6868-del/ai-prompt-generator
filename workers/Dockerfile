FROM python:3.12-slim
WORKDIR /worker
COPY workers/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY workers ./workers
CMD ["python", "-m", "workers.optimization.optimizer"]
