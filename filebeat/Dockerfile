# Use Filebeat 8.13.3 from Elastic's Docker registry
FROM docker.elastic.co/beats/filebeat:8.13.3

# Copy your custom filebeat.yml configuration file
COPY filebeat.yml /usr/share/filebeat/filebeat.yml

# Change ownership and permissions of the configuration file
USER root
RUN chown root:filebeat /usr/share/filebeat/filebeat.yml && \
    chmod go-w /usr/share/filebeat/filebeat.yml

# Switch back to non-root user
USER filebeat
