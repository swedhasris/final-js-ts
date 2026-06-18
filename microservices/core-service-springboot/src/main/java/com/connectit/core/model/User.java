package com.connectit.core.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "users", indexes = {
    @Index(name = "idx_users_email",  columnList = "email"),
    @Index(name = "idx_users_uid",    columnList = "uid"),
    @Index(name = "idx_users_role",   columnList = "role"),
    @Index(name = "idx_users_active", columnList = "is_active")
})
@Data @NoArgsConstructor @AllArgsConstructor @Builder
public class User {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false, length = 128)
    private String uid;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(length = 255)
    private String passwordHash;

    @Column(nullable = false)
    private String name;

    @Column(length = 30)
    private String role = "user";

    @Column(length = 50)
    private String phone;

    @Column(length = 100)
    private String department;

    @Column(nullable = false)
    private Boolean isActive = true;

    private Boolean isDemo = false;

    private Boolean emailVerified = false;

    @Column(columnDefinition = "TEXT")
    private String photoUrl;

    @Column(length = 50)
    private String provider = "email";

    @Column(columnDefinition = "TEXT")
    private String restrictedModules;

    @Column(updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
    private LocalDateTime lastLogin;

    @PrePersist
    public void prePersist() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
