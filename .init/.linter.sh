SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR" && sh ./mvnw -q help:evaluate -Dexpression=project.artifactId -DforceStdout >/dev/null
