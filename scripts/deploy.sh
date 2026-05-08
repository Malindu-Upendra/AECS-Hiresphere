#!/bin/bash
set -e

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=${AWS_REGION:-ap-southeast-1}
ECR_BASE="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
CLUSTER_NAME="hiresphere-cluster"
SERVICES=("auth-service" "user-service" "booking-service" "messaging-service" "submission-service" "session-service")

echo "==> Deploying CloudFormation stack..."
aws cloudformation deploy \
  --template-file infrastructure/cloudformation/stack.yaml \
  --stack-name hiresphere-stack \
  --capabilities CAPABILITY_NAMED_IAM \
  --region $AWS_REGION

echo "==> Logging into ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_BASE

echo "==> Building and pushing Docker images..."
for SVC in "${SERVICES[@]}"; do
  echo "  -> $SVC"
  docker build -t hiresphere/$SVC ./services/$SVC
  docker tag hiresphere/$SVC:latest $ECR_BASE/hiresphere/$SVC:latest
  docker push $ECR_BASE/hiresphere/$SVC:latest
done

echo "==> Updating kubeconfig for EKS..."
aws eks update-kubeconfig --name $CLUSTER_NAME --region $AWS_REGION

echo "==> Applying Kubernetes manifests..."
kubectl apply -f infrastructure/k8s/namespace.yaml
kubectl apply -f infrastructure/k8s/configmap.yaml
kubectl apply -f infrastructure/k8s/secret.yaml
for SVC in "${SERVICES[@]}"; do
  kubectl apply -f infrastructure/k8s/$SVC.yaml
done
kubectl apply -f infrastructure/k8s/ingress.yaml

echo "==> All done! Getting ingress URL..."
kubectl get ingress -n hiresphere
