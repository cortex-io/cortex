{{/*
Expand the name of the chart.
*/}}
{{- define "mcp-server.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "mcp-server.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "mcp-server.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "mcp-server.labels" -}}
helm.sh/chart: {{ include "mcp-server.chart" . }}
{{ include "mcp-server.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: cortex
{{- if .Values.mcpServer.type }}
cortex.ai/mcp-type: {{ .Values.mcpServer.type | quote }}
{{- end }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "mcp-server.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mcp-server.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Values.mcpServer.name }}
cortex.ai/mcp-server: {{ .Values.mcpServer.name | quote }}
{{- end }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "mcp-server.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "mcp-server.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Image pull policy
*/}}
{{- define "mcp-server.imagePullPolicy" -}}
{{- .Values.image.pullPolicy | default "IfNotPresent" }}
{{- end }}

{{/*
Image tag
*/}}
{{- define "mcp-server.imageTag" -}}
{{- .Values.image.tag | default .Chart.AppVersion }}
{{- end }}

{{/*
Full image name
*/}}
{{- define "mcp-server.image" -}}
{{- printf "%s:%s" .Values.image.repository (include "mcp-server.imageTag" .) }}
{{- end }}

{{/*
ConfigMap name
*/}}
{{- define "mcp-server.configMapName" -}}
{{- printf "%s-config" (include "mcp-server.fullname" .) }}
{{- end }}

{{/*
Secret name
*/}}
{{- define "mcp-server.secretName" -}}
{{- printf "%s-secret" (include "mcp-server.fullname" .) }}
{{- end }}

{{/*
Service name
*/}}
{{- define "mcp-server.serviceName" -}}
{{- include "mcp-server.fullname" . }}
{{- end }}

{{/*
Return true if autoscaling is enabled
*/}}
{{- define "mcp-server.autoscalingEnabled" -}}
{{- or .Values.autoscaling.enabled .Values.keda.enabled }}
{{- end }}

{{/*
Return the appropriate apiVersion for HPA
*/}}
{{- define "mcp-server.hpa.apiVersion" -}}
{{- if .Capabilities.APIVersions.Has "autoscaling/v2" }}
{{- print "autoscaling/v2" }}
{{- else }}
{{- print "autoscaling/v2beta2" }}
{{- end }}
{{- end }}

{{/*
Return the appropriate apiVersion for PodDisruptionBudget
*/}}
{{- define "mcp-server.pdb.apiVersion" -}}
{{- if .Capabilities.APIVersions.Has "policy/v1/PodDisruptionBudget" }}
{{- print "policy/v1" }}
{{- else }}
{{- print "policy/v1beta1" }}
{{- end }}
{{- end }}

{{/*
Return the appropriate apiVersion for Ingress
*/}}
{{- define "mcp-server.ingress.apiVersion" -}}
{{- if .Capabilities.APIVersions.Has "networking.k8s.io/v1/Ingress" }}
{{- print "networking.k8s.io/v1" }}
{{- else if .Capabilities.APIVersions.Has "networking.k8s.io/v1beta1/Ingress" }}
{{- print "networking.k8s.io/v1beta1" }}
{{- else }}
{{- print "extensions/v1beta1" }}
{{- end }}
{{- end }}

{{/*
Validate configuration
*/}}
{{- define "mcp-server.validateConfig" -}}
{{- if and .Values.autoscaling.enabled .Values.keda.enabled }}
{{- fail "Cannot enable both HPA (autoscaling.enabled) and KEDA (keda.enabled) at the same time" }}
{{- end }}
{{- if and .Values.podDisruptionBudget.enabled (not (or .Values.autoscaling.enabled .Values.keda.enabled)) }}
{{- if lt (.Values.replicaCount | int) 2 }}
{{- fail "PodDisruptionBudget requires at least 2 replicas or autoscaling to be enabled" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Return pod labels
*/}}
{{- define "mcp-server.podLabels" -}}
{{ include "mcp-server.selectorLabels" . }}
{{- with .Values.podLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Return pod annotations
*/}}
{{- define "mcp-server.podAnnotations" -}}
{{- with .Values.podAnnotations }}
{{ toYaml . }}
{{- end }}
{{- end }}
