pipeline {
    agent any

    tools {
        nodejs 'NodeJS 22'
    }

    options {
        skipDefaultCheckout(true)
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    parameters {
        choice(name: 'DEPLOY_TARGET', choices: ['none', 'docker', 'eks'], description: 'Deployment destination')
        string(name: 'IMAGE_NAME', defaultValue: 'simple-notes', description: 'Image repository name')
        string(name: 'IMAGE_TAG', defaultValue: '', description: 'Optional image tag; defaults to the Git commit')
        string(name: 'DOCKER_HOST_PORT', defaultValue: '3000', description: 'Host port for Docker deployment')
    }

    environment {
        TRIVY_CACHE_DIR = '.trivycache'
        IMAGE_TAG = "${params.IMAGE_TAG?.trim() ? params.IMAGE_TAG.trim() : (env.GIT_COMMIT ?: env.BUILD_NUMBER)}"
        IMAGE_REPOSITORY = "${params.IMAGE_NAME}"
        IMAGE_REF = "${params.IMAGE_NAME}:${params.IMAGE_TAG?.trim() ? params.IMAGE_TAG.trim() : (env.GIT_COMMIT ?: env.BUILD_NUMBER)}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_COMMIT = sh(script: 'git rev-parse --short=12 HEAD', returnStdout: true).trim()
                    if (!params.IMAGE_TAG?.trim()) {
                        env.IMAGE_TAG = env.GIT_COMMIT
                        env.IMAGE_REF = "${env.IMAGE_REPOSITORY}:${env.IMAGE_TAG}"
                    }
                }
            }
        }

        stage('Install dependencies') {
            steps {
                sh 'npm install --no-audit --no-fund'
            }
        }

        stage('Source security scan') {
            steps {
                sh '''
                    trivy fs --scanners vuln,misconfig,secret,license \
                      --severity HIGH,CRITICAL --exit-code 1 \
                      --format json --output trivy-fs-report.json .
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'trivy-fs-report.json', allowEmptyArchive: true
                }
            }
        }

        stage('Syntax check') {
            steps {
                sh 'npm run check'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test -- --experimental-test-coverage --test-reporter=spec --test-reporter-destination=stdout'
            }
        }

        stage('SonarQube analysis') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    sh '''
                        sonar-scanner \
                          -Dsonar.projectKey=simple-notes \
                          -Dsonar.projectName="Simple Notes" \
                          -Dsonar.sources=server.js,config.js,public \
                          -Dsonar.tests=config.test.js \
                          -Dsonar.test.inclusions=config.test.js \
                          -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                          -Dsonar.exclusions=**/node_modules/**,**/coverage/**
                    '''
                }
            }
        }

        stage('SonarQube quality gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Build image') {
            steps {
                sh '''
                    docker build --pull \
                      --label "org.opencontainers.image.revision=$GIT_COMMIT" \
                      --label "org.opencontainers.image.source=$BUILD_URL" \
                      --tag "$IMAGE_REF" .
                '''
            }
        }

        stage('Image security scan') {
            steps {
                sh '''
                    trivy image --scanners vuln,misconfig,secret,license \
                      --severity HIGH,CRITICAL --exit-code 1 \
                      --format json --output trivy-image-report.json "$IMAGE_REF"
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'trivy-image-report.json', allowEmptyArchive: true
                }
            }
        }

        stage('Publish image') {
            when {
                expression { return params.DEPLOY_TARGET != 'none' }
            }
            steps {
                script {
                    if (!env.REGISTRY_URL?.trim()) {
                        error('Set Jenkins environment variable REGISTRY_URL to publish deployment images.')
                    }
                    env.PUBLISHED_IMAGE = "${env.REGISTRY_URL.replaceAll('/+$', '')}/${env.IMAGE_REF}"
                }
                withCredentials([usernamePassword(credentialsId: 'container-registry', usernameVariable: 'REGISTRY_USER', passwordVariable: 'REGISTRY_PASSWORD')]) {
                    sh '''
                        set +x
                        printf '%s' "$REGISTRY_PASSWORD" | docker login "$REGISTRY_URL" \
                          --username "$REGISTRY_USER" --password-stdin
                        docker tag "$IMAGE_REF" "$PUBLISHED_IMAGE"
                        docker push "$PUBLISHED_IMAGE"
                        docker logout "$REGISTRY_URL"
                    '''
                }
            }
        }

        stage('Deploy to Docker') {
            when {
                expression { return params.DEPLOY_TARGET == 'docker' }
            }
            steps {
                sh '''
                    docker rm --force simple-notes || true
                    docker run --detach --name simple-notes --restart unless-stopped \
                      --publish "${DOCKER_HOST_PORT}:3000" \
                      --env-file .env --env HOST=0.0.0.0 \
                      --env DB_HOST="${DOCKER_DB_HOST:-host.docker.internal}" \
                      "$PUBLISHED_IMAGE"
                '''
            }
        }

        stage('Deploy to EKS') {
            when {
                expression { return params.DEPLOY_TARGET == 'eks' }
            }
            steps {
                withCredentials([file(credentialsId: 'eks-kubeconfig', variable: 'KUBECONFIG')]) {
                    sh '''
                        : "${EKS_NAMESPACE:?Set EKS_NAMESPACE in the Jenkins job environment}"
                        : "${EKS_DEPLOYMENT:?Set EKS_DEPLOYMENT in the Jenkins job environment}"
                        : "${EKS_CONTAINER:?Set EKS_CONTAINER in the Jenkins job environment}"
                        kubectl -n "$EKS_NAMESPACE" set image \
                          "deployment/$EKS_DEPLOYMENT" "$EKS_CONTAINER=$PUBLISHED_IMAGE"
                        kubectl -n "$EKS_NAMESPACE" rollout status \
                          "deployment/$EKS_DEPLOYMENT" --timeout=180s
                    '''
                }
            }
        }
    }

    post {
        always {
            sh 'docker image rm "$IMAGE_REF" 2>/dev/null || true'
            archiveArtifacts artifacts: 'trivy-*-report.json', allowEmptyArchive: true
            cleanWs()
        }
    }
}
